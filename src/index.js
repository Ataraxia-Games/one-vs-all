const express = require('express');
const path = require('path'); // Используем path для корректной отдачи статики
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Отдаем статические файлы из папки 'src/client'
// Используем path.join для корректного пути независимо от ОС
const clientPath = path.join(__dirname, 'client');
console.log(`Serving static files from: ${clientPath}`); 
app.use(express.static(clientPath));

// --- Утилиты ---

// Функция расчета углов стены (скопировано из client/js/entities/Wall.js)
function calculateWallCorners(wall) {
    const halfLength = wall.length / 2;
    const halfWidth = wall.width / 2;
    const cosAngle = Math.cos(wall.angle);
    const sinAngle = Math.sin(wall.angle);

    const lengthVecX = halfLength * cosAngle;
    const lengthVecY = halfLength * sinAngle;
    const widthVecX = halfWidth * -sinAngle; 
    const widthVecY = halfWidth * cosAngle;

    return [
        { x: wall.x + lengthVecX + widthVecX, y: wall.y + lengthVecY + widthVecY },
        { x: wall.x + lengthVecX - widthVecX, y: wall.y + lengthVecY - widthVecY },
        { x: wall.x - lengthVecX - widthVecX, y: wall.y - lengthVecY - widthVecY },
        { x: wall.x - lengthVecX + widthVecX, y: wall.y - lengthVecY + widthVecY }
    ];
}

// Collision check function (скопировано из client/js/utils/collision.js)
function checkCircleWallCollision(circle, wall) {
    // Убедимся, что у стены есть углы для расчета
    if (!wall.corners) {
        console.warn("Collision check failed: wall missing corners property.", wall);
        return { collided: false };
    }
    // 1. Transform circle center to wall's local coordinate system
    const dx = circle.x - wall.x;
    const dy = circle.y - wall.y;
    const cosAngle = Math.cos(-wall.angle);
    const sinAngle = Math.sin(-wall.angle);
    const localCircleX = dx * cosAngle - dy * sinAngle;
    const localCircleY = dx * sinAngle + dy * cosAngle;

    // 2. Find the closest point on the (non-rotated) wall rectangle
    const halfLength = wall.length / 2;
    const halfWidth = wall.width / 2;
    const closestX = Math.max(-halfLength, Math.min(localCircleX, halfLength));
    const closestY = Math.max(-halfWidth, Math.min(localCircleY, halfWidth));

    // 3. Calculate distance squared
    const distX = localCircleX - closestX;
    const distY = localCircleY - closestY;
    const distanceSquared = (distX * distX) + (distY * distY);

    // 4. Check collision and calculate push vector if needed
    const radiusSquared = circle.radius * circle.radius;
    if (distanceSquared < radiusSquared && distanceSquared > 1e-9) { 
        const distance = Math.sqrt(distanceSquared);
        const overlap = circle.radius - distance;
        
        const pushVecLocalX = distX / distance;
        const pushVecLocalY = distY / distance;
        
        const cosAngleWall = Math.cos(wall.angle);
        const sinAngleWall = Math.sin(wall.angle);
        const pushVecWorldX = pushVecLocalX * cosAngleWall - pushVecLocalY * sinAngleWall;
        const pushVecWorldY = pushVecLocalX * sinAngleWall + pushVecLocalY * cosAngleWall;

        return {
            collided: true,
            overlap: overlap,
            pushX: pushVecWorldX, 
            pushY: pushVecWorldY
        };
    } else if (distanceSquared <= 1e-9 && radiusSquared > 0) {
        const approxPushX = dx / (Math.sqrt(dx*dx + dy*dy) || 1);
        const approxPushY = dy / (Math.sqrt(dx*dx + dy*dy) || 1);
         return {
            collided: true,
            overlap: circle.radius, 
            pushX: approxPushX, 
            pushY: approxPushY
        };
    }

    return { collided: false };
}

// --- Утилита: Проверка точки внутри полигона (Ray Casting) ---
function isPointInsidePolygon(point, polygonVertices) {
    let x = point.x, y = point.y;
    let isInside = false;
    for (let i = 0, j = polygonVertices.length - 1; i < polygonVertices.length; j = i++) {
        let xi = polygonVertices[i].x, yi = polygonVertices[i].y;
        let xj = polygonVertices[j].x, yj = polygonVertices[j].y;

        let intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
}

// --- Map Generation (скопировано из client/js/entities/MapGenerator.js) ---
// Простой класс Wall для MapGenerator'а на сервере
class ServerMapWall {
    constructor(x, y, length, angle, color = '#000000', width = 20, isBoundary = false) {
        this.x = x;
        this.y = y;
        this.length = length;
        this.angle = angle;
        this.color = color;
        this.width = width;
        this.isBoundary = isBoundary;
        // Углы будут вычислены и добавлены позже
        this.corners = []; 
    }
    
    // Метод для получения данных для отправки клиенту
    getSerializableData() {
        return {
            x: this.x,
            y: this.y,
            length: this.length,
            angle: this.angle,
            color: this.color,
            width: this.width // Отправляем и ширину
        };
    }
}

class MapGenerator {
    constructor(worldWidth, worldHeight) {
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        this.walls = [];
        this.boundaryVertices = []; // <-- Добавляем массив для вершин
        this.generateBoundaryWalls();
        this.generateInnerWalls();
        // Вычисляем углы для всех сгенерированных стен
        this.walls.forEach(wall => {
            wall.corners = calculateWallCorners(wall);
        });
    }

    generateBoundaryWalls() {
        const centerX = this.worldWidth / 2;
        const centerY = this.worldHeight / 2;
        const numVertices = 15; 
        const radius = Math.min(this.worldWidth, this.worldHeight) / 2 * 0.9; 
        const angleStep = (Math.PI * 2) / numVertices;

        this.boundaryVertices = []; // Очищаем/инициализируем массив вершин класса
        const vertices = [];
        for (let i = 0; i < numVertices; i++) {
            const currentAngle = i * angleStep + (Math.random() - 0.5) * angleStep * 0.8;
            const currentRadius = radius * (0.8 + Math.random() * 0.4);
            const x = centerX + currentRadius * Math.cos(currentAngle);
            const y = centerY + currentRadius * Math.sin(currentAngle);
            vertices.push({ x, y });
            this.boundaryVertices.push({ x, y }); // <-- Сохраняем вершину
        }

        for (let i = 0; i < numVertices; i++) {
            const start = this.boundaryVertices[i]; // Используем сохраненные вершины
            const end = this.boundaryVertices[(i + 1) % numVertices]; 
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            const wallX = start.x + dx / 2;
            const wallY = start.y + dy / 2;
            // Используем ServerMapWall, указываем что это граница
            this.walls.push(new ServerMapWall(wallX, wallY, length, angle, '#000000', 20, true));
        }
    }

    generateInnerWalls() {
        const numInnerWalls = 50; 
        const minLength = 80;
        const maxLength = 300;
        const padding = 100; 

        for (let i = 0; i < numInnerWalls; i++) {
            const x = padding + Math.random() * (this.worldWidth - 2 * padding);
            const y = padding + Math.random() * (this.worldHeight - 2 * padding);
            const length = minLength + Math.random() * (maxLength - minLength);
            const angle = Math.random() * Math.PI * 2; 
             // Используем ServerMapWall, границей не является (по умолчанию false)
            this.walls.push(new ServerMapWall(x, y, length, angle, '#000000'));
        }
    }

    getWalls() {
        return this.walls;
    }
    
    getBoundaryVertices() { // <-- Новый метод для получения вершин
        return this.boundaryVertices;
    }
}


// -- Игровое состояние на сервере --
const players = {}; // { id: { ..., name, health, maxHealth, ammo, isPredator, ... } }
const bullets = []; // <-- Массив для хранения активных пуль
let nextBulletId = 0; // <-- Счетчик для уникальных ID пуль
const worldWidth = 2000 * 1.3;
const worldHeight = 2000 * 1.3;
// Генерируем стены ОДИН РАЗ при старте сервера
const mapGenerator = new MapGenerator(worldWidth, worldHeight);
const serverWalls = mapGenerator.getWalls(); // Теперь содержит стены с углами
console.log(`Generated ${serverWalls.length} walls on the server.`);
const playerSpeed = 200; 
const playerRadius = 15;
const hunterBaseHealth = 100; // Базовое здоровье Охотника
const BASE_PREDATOR_HEALTH = 100; // Базовое здоровье Хищника
const HEALTH_PER_HUNTER = 50;   // Доп. здоровье за каждого Охотника
const shootCooldown = 500; // Кулдаун выстрела в мс
const bulletSpeed = 600; // Скорость пули (пикс/сек)
const bulletLifetime = 1000; // Время жизни пули в мс
const shotgunPellets = 7; // Кол-во дробинок
const shotgunSpread = Math.PI / 12; // Разброс дроби
const bulletRadius = 2; // Добавим радиус пули для столкновений
const bulletDamage = 10; // Урон от пули
let predatorAssigned = false; // Флаг, что Хищник уже назначен

// --- Хелпер-функция для расчета здоровья Хищника ---
function calculatePredatorMaxHealth(numPlayers) {
    const numHunters = Math.max(0, numPlayers - 1); // Считаем Охотников
    return BASE_PREDATOR_HEALTH + numHunters * HEALTH_PER_HUNTER;
}

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);
    // НЕ СОЗДАЕМ игрока здесь, ждем 'joinGame'

    socket.on('joinGame', (data) => {
        const playerName = data.name ? String(data.name).trim().slice(0, 16) : `Player_${socket.id.slice(0, 4)}`; // Ограничиваем имя
        console.log(`Player ${socket.id} trying to join as "${playerName}"`);

        // TODO: Проверка, не занято ли имя?

        // Назначаем роль Хищника первому игроку
        let isPredator = false;
        if (!predatorAssigned) {
            isPredator = true;
            predatorAssigned = true;
            console.log(`Player "${playerName}" (${socket.id}) is the PREDATOR!`);
        }

        // Рассчитываем начальное здоровье
        const numPlayersTotal = Object.keys(players).length + 1;
        const initialMaxHealth = isPredator ? calculatePredatorMaxHealth(numPlayersTotal) : hunterBaseHealth;

        // --- Генерация безопасной точки спавна внутри границ карты ---
        const boundaryVertices = mapGenerator.getBoundaryVertices();
        let spawnX, spawnY;
        let attempts = 0;
        const maxSpawnAttempts = 100; // Предохранитель от бесконечного цикла
        do {
            // Генерируем точку с отступом от краев мира
            spawnX = 100 + Math.random() * (worldWidth - 200);
            spawnY = 100 + Math.random() * (worldHeight - 200);
            attempts++;
            if (attempts > maxSpawnAttempts) {
                console.warn(`Failed to find valid spawn point after ${maxSpawnAttempts} attempts. Spawning near center.`);
                spawnX = worldWidth / 2; // Запасной вариант
                spawnY = worldHeight / 2;
                break;
            }
        } while (!isPointInsidePolygon({ x: spawnX, y: spawnY }, boundaryVertices));
        console.log(`Spawn point found after ${attempts} attempts: (${spawnX.toFixed(0)}, ${spawnY.toFixed(0)})`);
        // --- Конец генерации точки спавна ---

        // Создаем игрока
        players[socket.id] = {
            id: socket.id,
            name: playerName,
            isPredator: isPredator,
            x: spawnX, // Используем безопасные координаты
            y: spawnY,
            angle: 0,
            color: '#000000', 
            maxHealth: initialMaxHealth, 
            health: initialMaxHealth,    
            ammo: 10,    
            maxAmmo: 10, 
            input: { keys: {}, angle: 0, isShiftDown: false, isAiming: false }, 
            lastShotTime: 0, 
            lastAttackTime: 0, // Для кулдауна атаки Хищника
            lastFakeTrailTime: 0 // Для кулдауна ложного следа Хищника
        };

        // Если присоединился ОХОТНИК, обновляем здоровье Хищника
        if (!isPredator) {
            const predatorId = Object.keys(players).find(id => id !== socket.id && players[id].isPredator);
            if (predatorId) {
                const newPredatorMaxHealth = calculatePredatorMaxHealth(Object.keys(players).length);
                players[predatorId].maxHealth = newPredatorMaxHealth;
                players[predatorId].health = newPredatorMaxHealth; // Исцеляем до нового максимума
                console.log(`Predator ${players[predatorId].name} health updated to ${newPredatorMaxHealth} due to new Hunter.`);
            }
        }

        // Готовим данные стен для отправки
        const wallsToSend = serverWalls.map(wall => wall.getSerializableData());

        // Отправляем новому игроку его ID, состояние ВСЕХ игроков (включая себя) И СТЕНЫ
        socket.emit('init', { 
            id: socket.id,
            players: players, // Отправляем весь объект players
            walls: wallsToSend 
        });

        // Отправляем всем ОСТАЛЬНЫМ информацию о новом игроке
        socket.broadcast.emit('playerConnected', players[socket.id]);
        console.log(`Player "${playerName}" (${socket.id}) joined. Total players: ${Object.keys(players).length}`);
    });

    // Обработка получения ввода от клиента
    socket.on('playerInput', (inputData) => {
        const player = players[socket.id];
        if (!player) return; 

        player.input = inputData;
        player.angle = inputData.angle; 
    });

    // Обработка запроса на выстрел
    socket.on('playerShoot', () => {
        const player = players[socket.id];
        if (!player) return;

        const now = Date.now(); // Используем Date.now() на сервере
        // Проверка кулдауна и патронов
        if (now - player.lastShotTime < shootCooldown) {
            // console.log(`Player ${socket.id} shoot cooldown active.`);
            return; // Еще не время
        }
        if (player.ammo <= 0) {
            // console.log(`Player ${socket.id} out of ammo.`);
            return; // Нет патронов
        }

        console.log(`Player ${socket.id} shoots!`);
        player.lastShotTime = now; // Обновляем время последнего выстрела
        player.ammo--; // Уменьшаем патроны

        // Создаем пули (дробовик)
        for (let i = 0; i < shotgunPellets; i++) {
            const spreadAngle = player.angle + (Math.random() - 0.5) * shotgunSpread;
            // Создаем пулю чуть впереди игрока
            const startX = player.x + Math.cos(player.angle) * (playerRadius + 5); 
            const startY = player.y + Math.sin(player.angle) * (playerRadius + 5);
            
            const newBullet = {
                id: nextBulletId++,
                ownerId: player.id,
                x: startX,
                y: startY,
                angle: spreadAngle,
                speed: bulletSpeed,
                spawnTime: now, // Время создания для расчета времени жизни
                lifetime: bulletLifetime,
                radius: bulletRadius, // <-- Добавляем радиус
                isActive: true
            };
            bullets.push(newBullet); // Добавляем пулю в массив
        }
    });

    // Обработка атаки Хищника (пример с кулдауном)
    socket.on('predatorAttack', () => {
        const player = players[socket.id];
        if (player && player.isPredator) {
            const attackRange = 75; // Дальность атаки (было 60)
            const attackAngleSpread = Math.PI / 3; // Угол ~60 градусов
            const predatorAttackDamage = 35; 
            const attackCooldown = 500; // 0.5 секунды

            const now = Date.now();
            if (player.lastAttackTime && now - player.lastAttackTime < attackCooldown) {
                return; // Атака на кулдауне
            }
            player.lastAttackTime = now; 
            console.log(`[Attack] Predator ${player.name} (${socket.id}) initiated attack.`);
            
            let hitDetected = false; // Флаг, что мы кого-то ударили
            // --- Логика поиска цели и урона --- 
            for (const targetId in players) {
                if (targetId === socket.id) continue; // Не атакуем себя
                const target = players[targetId];
                // Атакуем только живых Охотников
                if (!target.isPredator && target.health > 0) { 
                    const dx = target.x - player.x;
                    const dy = target.y - player.y;
                    const distSq = dx * dx + dy * dy;

                    // 1. Проверка дальности
                    if (distSq <= attackRange * attackRange) {
                        // 2. Проверка угла
                        const angleToTarget = Math.atan2(dy, dx);
                        let angleDiff = angleToTarget - player.angle;
                        // Нормализуем угол [-PI, PI]
                        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                        if (Math.abs(angleDiff) <= attackAngleSpread / 2) {
                            // --- Попадание! ---
                            hitDetected = true;
                            console.log(`[Attack Hit] Predator ${player.name} hit ${target.name}`);
                            target.health -= predatorAttackDamage;
                            target.health = Math.max(0, target.health); // Не уходим в минус
                            // gameStateUpdate отправит новое здоровье всем
                        }
                    }
                }
            }
            // --- Конец логики поиска цели ---
            if(hitDetected) {
                // Можно добавить звук или эффект на клиенте?
                // io.to(socket.id).emit('predatorHitConfirm'); // Пример
            }
        }
    });

    // --- НОВЫЕ ОБРАБОТЧИКИ ЭФФЕКТОВ ---
    const effectCooldown = 200; // Кулдаун для ложного следа

    socket.on('predatorUsedFakeTrail', (pos) => {
        const player = players[socket.id];
        if (!player || !player.isPredator) return; // Только Хищник
        if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return; // Проверка данных
        const now = Date.now();
        if (now - player.lastFakeTrailTime > effectCooldown) { // Используем отдельный кулдаун?
            player.lastFakeTrailTime = now;
             // Ограничиваем координаты, чтобы не спамить эффекты за картой?
            const safeX = Math.max(0, Math.min(worldWidth, pos.x));
            const safeY = Math.max(0, Math.min(worldHeight, pos.y));
            io.emit('createEffect', { type: 'speedCircle', x: safeX, y: safeY });
        }
    });
    // --- КОНЕЦ ОБРАБОТЧИКОВ ЭФФЕКТОВ ---

    // Обработка отключения
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const player = players[socket.id];
        if (player) {
            console.log(`Player "${player.name}" (${socket.id}) left.`);
            const wasPredator = player.isPredator;
            
            // Если отключается ОХОТНИК, обновляем здоровье Хищника
            if (!wasPredator) {
                const predatorId = Object.keys(players).find(id => id !== socket.id && players[id].isPredator);
                if (predatorId) {
                    // Пересчитываем до удаления игрока
                    const newPredatorMaxHealth = calculatePredatorMaxHealth(Object.keys(players).length - 1);
                    players[predatorId].maxHealth = newPredatorMaxHealth;
                    players[predatorId].health = Math.min(players[predatorId].health, newPredatorMaxHealth);
                    console.log(`Predator ${players[predatorId].name} health updated to ${newPredatorMaxHealth} due to Hunter leaving.`);
                }
            } else {
                 console.log("Predator disconnected! Resetting assignment.");
                 predatorAssigned = false;
            }
            
            delete players[socket.id];
            io.emit('playerDisconnected', socket.id); 
            console.log(`Total players: ${Object.keys(players).length}`);
        }
    });
});

// --- Логика обновления игрока на сервере ---
function updatePlayer(player, dt) {
    if (!player || !player.input) return;

    // Определяем текущую скорость с учетом спринта
    let currentSpeed = playerSpeed; // Базовая скорость
    const sprintMultiplier = 1.8; // Множитель скорости спринта
    if (player.input.isShiftDown) { 
        currentSpeed *= sprintMultiplier; 
    }

    // Расчет смещения с использованием currentSpeed
    let deltaX = 0;
    let deltaY = 0;
    const keys = player.input.keys || {}; 
    if (keys.w) deltaY -= currentSpeed * dt; // Используем currentSpeed
    if (keys.s) deltaY += currentSpeed * dt; // Используем currentSpeed
    if (keys.a) deltaX -= currentSpeed * dt; // Используем currentSpeed
    if (keys.d) deltaX += currentSpeed * dt; // Используем currentSpeed

    // Нормализация диагонали
    if (deltaX !== 0 && deltaY !== 0) {
        const factor = 1 / Math.sqrt(2);
        deltaX *= factor;
        deltaY *= factor;
    }

    // Переменные для хранения итоговой позиции ПОСЛЕ проверки столкновений
    let finalX = player.x + deltaX;
    let finalY = player.y + deltaY;

    // --- Столкновения со стенами (Pushback) - проверяем для ВСЕХ --- 
    const maxPushIterations = 3;
    for (let i = 0; i < maxPushIterations; i++) {
        let collisionOccurred = false;
        for (const wall of serverWalls) { 
            // Пропускаем проверку для Хищника со ВНУТРЕННИМИ стенами
            if (player.isPredator && !wall.isBoundary) {
                continue;
            }

            // Проверяем столкновение с текущей предполагаемой позицией (finalX, finalY)
            const collisionResult = checkCircleWallCollision(
                { x: finalX, y: finalY, radius: playerRadius }, 
                wall 
            );
            if (collisionResult.collided) {
                collisionOccurred = true;
                const pushAmount = collisionResult.overlap + 0.01;
                finalX += collisionResult.pushX * pushAmount; // Корректируем итоговую позицию
                finalY += collisionResult.pushY * pushAmount; // Корректируем итоговую позицию
            }
        }
        if (!collisionOccurred) break; // Если итерация прошла без коллизий, выходим
    }
    // --- Конец столкновений ---

    // Применяем позицию после всех проверок и выталкиваний
    player.x = finalX;
    player.y = finalY;

    // Ограничение по краям мира (грубое)
    player.x = Math.max(playerRadius, Math.min(worldWidth - playerRadius, player.x));
    player.y = Math.max(playerRadius, Math.min(worldHeight - playerRadius, player.y));

    // Ограничение по здоровью
    if (player.health < 0) player.health = 0;
}

// --- Логика обновления пули на сервере ---
function updateBullet(bullet, dt, walls) {
    // Движение
    const moveX = Math.cos(bullet.angle) * bullet.speed * dt;
    const moveY = Math.sin(bullet.angle) * bullet.speed * dt;
    const nextX = bullet.x + moveX;
    const nextY = bullet.y + moveY;

    // Проверка времени жизни
    const aliveTime = Date.now() - bullet.spawnTime;
    if (aliveTime > bullet.lifetime) {
        bullet.isActive = false; // Помечаем для удаления
        return; // Дальше проверять не нужно
    }

    // Проверка столкновений пуля-стена
    for (const wall of walls) {
        if (checkCircleWallCollision({ x: nextX, y: nextY, radius: bullet.radius }, wall).collided) {
            bullet.isActive = false;
            return; // Пуля исчезает при столкновении со стеной
        }
    }

    // Обновляем позицию, если не было столкновений
    bullet.x = nextX;
    bullet.y = nextY;
    // TODO: Проверка столкновений пуля-игрок (будет в основном цикле)
}

// --- Серверный игровой цикл --- 
const TICK_RATE = 30; 
setInterval(() => {
    const now = Date.now();
    const dt = (1000 / TICK_RATE) / 1000; 

    // Обновляем всех игроков
    Object.values(players).forEach(player => {
        updatePlayer(player, dt);
    });

    // Обновляем все пули (движение, время жизни, столкновения со стенами)
    bullets.forEach(bullet => {
        if (bullet.isActive) { 
            updateBullet(bullet, dt, serverWalls);
        }
    });

    // Проверка столкновений Пуля-Игрок
    bullets.forEach(bullet => {
        if (!bullet.isActive) return; // Пропускаем неактивные пули

        Object.values(players).forEach(player => {
            if (!player || player.health <= 0) return; // Пропускаем отсутствующих или мертвых игроков
            if (bullet.ownerId === player.id) return; // Игрок не может попасть в себя

            // Простая проверка столкновения кругов
            const dx = bullet.x - player.x;
            const dy = bullet.y - player.y;
            const distSq = dx * dx + dy * dy;
            const radiiSumSq = (bullet.radius + playerRadius) * (bullet.radius + playerRadius);

            if (distSq < radiiSumSq) {
                // Столкновение!
                player.health -= bulletDamage;
                if (player.health < 0) player.health = 0;
                bullet.isActive = false; // Пуля исчезает
                console.log(`Player ${player.id} hit by bullet ${bullet.id}! Health: ${player.health}`);
                // TODO: Отправить событие о попадании клиентам? (для звука/эффекта)
                return; // Пуля может поразить только одного игрока за тик
            }
        });
    });

    // Удаляем неактивные пули
    const activeBullets = bullets.filter(bullet => bullet.isActive);
    if (activeBullets.length !== bullets.length) {
        bullets.length = 0; 
        bullets.push(...activeBullets); 
    }

    // Собираем состояние для отправки
    const gameState = {
        players: Object.values(players).map(p => {
            const inputKeys = p.input.keys || {};
            const isMoving = inputKeys.w || inputKeys.a || inputKeys.s || inputKeys.d;
            const isSprinting = !!(isMoving && p.input.isShiftDown); 
            const isAiming = p.input.isAiming || false; // Получаем isAiming из player.input
            
            return {
                id: p.id,
                name: p.name,
                isPredator: p.isPredator,
                x: p.x,
                y: p.y,
                angle: p.angle,
                color: p.color,
                maxHealth: p.maxHealth, // <-- Отправляем maxHealth
                health: p.health, 
                ammo: p.ammo,     
                maxAmmo: p.maxAmmo, // <-- Отправляем maxAmmo
                isSprinting: isSprinting, 
                isAiming: isAiming // <-- Отправляем isAiming
            };
        }),
        bullets: bullets.map(bullet => ({ 
            id: bullet.id,
            x: bullet.x,
            y: bullet.y
        })) 
    };

    io.emit('gameStateUpdate', gameState);
}, 1000 / TICK_RATE);

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 