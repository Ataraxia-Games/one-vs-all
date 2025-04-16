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
        // console.warn("Collision check failed: wall missing corners property.", wall);
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
const bonuses = []; // <-- Массив для хранения активных бонусов { id, x, y }
let nextBulletId = 0; // <-- Счетчик для уникальных ID пуль
let nextBonusId = 0; // <-- Счетчик для уникальных ID бонусов
const worldWidth = 2000 * 1.3;
const worldHeight = 2000 * 1.3;
// Генерируем стены ОДИН РАЗ при старте сервера
const mapGenerator = new MapGenerator(worldWidth, worldHeight);
const serverWalls = mapGenerator.getWalls(); // Теперь содержит стены с углами
// console.log(`Generated ${serverWalls.length} walls on the server.`);
const playerSpeed = 200; 
const playerRadius = 15;
const hunterBaseHealth = 100; // Базовое здоровье Охотника
const BASE_PREDATOR_HEALTH = 100; // Базовое здоровье Хищника
const HEALTH_PER_HUNTER = 50;   // Доп. здоровье за каждого Охотника
const shootCooldown = 500; 
const bulletSpeed = 900; // Новая скорость (600 * 1.5)
const bulletLifetime = 1000; 
const shotgunPellets = 7; 
const shotgunSpread = Math.PI / 12; // Разброс дроби
const bulletRadius = 2; // Добавим радиус пули для столкновений
const bulletDamage = 10; // Урон от пули
let predatorAssigned = false; // Флаг, что Хищник уже назначен
const DAY_NIGHT_CYCLE_DURATION = 120 * 1000; // 2 минуты в мс
let currentCycleTime = 0;
let wasNight = true; // Флаг для отслеживания смены фазы
let cycleCounter = 1; // <-- Счетчик циклов дня/ночи

// --- Константы для бонусов ---
const BONUS_RADIUS = 15; // Такой же как у игрока?
const BONUS_SPAWN_PADDING = 50; // Отступ от края мира для спавна
const BONUS_WALL_BUFFER = BONUS_RADIUS + playerRadius + 10; // Буфер от стен (бонус + игрок + запас)
const MIN_BONUS_DISTANCE = 250; // Минимальное расстояние между бонусами
const MIN_BONUS_DISTANCE_SQ = MIN_BONUS_DISTANCE * MIN_BONUS_DISTANCE; // Квадрат расстояния для оптимизации
const MIN_SPAWN_DISTANCE_FROM_PREDATOR = 500; // Минимальное расстояние спавна Охотника от Хищника
const MIN_SPAWN_DISTANCE_FROM_PREDATOR_SQ = MIN_SPAWN_DISTANCE_FROM_PREDATOR * MIN_SPAWN_DISTANCE_FROM_PREDATOR;

// --- Хелпер-функция для расчета здоровья Хищника ---
function calculatePredatorMaxHealth(numPlayers) {
    const numHunters = Math.max(0, numPlayers - 1); // Считаем Охотников
    return BASE_PREDATOR_HEALTH + numHunters * HEALTH_PER_HUNTER;
}

io.on('connection', (socket) => {
    // console.log(`A user connected: ${socket.id}`);
    // НЕ СОЗДАЕМ игрока здесь, ждем 'joinGame'

    socket.on('joinGame', (data) => {
        const playerName = data.name ? String(data.name).trim().slice(0, 16) : `Player_${socket.id.slice(0, 4)}`;
        // console.log(`Player ${socket.id} trying to join as \"${playerName}\"`);

        // --- Проверка на уникальность имени --- 
        const lowerCaseName = playerName.toLowerCase();
        let nameTaken = false;
        for (const playerId in players) {
            if (players[playerId].name.toLowerCase() === lowerCaseName) {
                nameTaken = true;
                break;
            }
        }

        if (nameTaken) {
            // console.log(`Join attempt failed: Name \"${playerName}\" is already taken.`);
            socket.emit('joinError', { message: 'Это имя уже занято!' });
            // Не отключаем сокет сразу, даем клиенту обработать ошибку
            return; // Прерываем обработку joinGame
        }
        // --- Конец проверки имени ---

        // Назначаем роль Хищника первому игроку
        let isPredator = false;
        if (!predatorAssigned) {
            isPredator = true;
            predatorAssigned = true;
            // console.log(`Player \"${playerName}\" (${socket.id}) is the PREDATOR!`);
        }

        // Рассчитываем начальное здоровье
        const numPlayersTotal = Object.keys(players).length + 1;
        const initialMaxHealth = isPredator ? calculatePredatorMaxHealth(numPlayersTotal) : hunterBaseHealth;

        // Находим Хищника (если он есть и спавнится Охотник)
        let predator = null;
        if (!isPredator) { // Ищем только если спавнится Охотник
            const predatorId = Object.keys(players).find(id => players[id].isPredator);
            if (predatorId) {
                predator = players[predatorId];
            }
        }

        // --- Генерация безопасной точки спавна внутри границ карты ---
        const boundaryVertices = mapGenerator.getBoundaryVertices();
        let spawnX, spawnY;
        let attempts = 0;
        const maxSpawnAttempts = 100; // Предохранитель от бесконечного цикла
        let collisionWithBoundary; // Объявляем переменную ЗДЕСЬ
        let tooCloseToPredator = false; // <-- Объявляем переменную ЗДЕСЬ и инициализируем

        do {
            collisionWithBoundary = false; // Сбрасываем флаг в начале итерации
            // Генерируем точку с отступом от краев мира
            spawnX = 100 + Math.random() * (worldWidth - 200);
            spawnY = 100 + Math.random() * (worldHeight - 200);
            attempts++;
            if (attempts > maxSpawnAttempts) {
                // console.warn(`Failed to find valid spawn point after ${maxSpawnAttempts} attempts. Spawning near center.`);
                spawnX = worldWidth / 2; // Запасной вариант
                spawnY = worldHeight / 2;
                break;
            }
            // --- Дополнительная проверка: не спавнимся ВНУТРИ граничной стены ---
            for (const wall of serverWalls) {
                if (wall.isBoundary) {
                    if (checkCircleWallCollision({ x: spawnX, y: spawnY, radius: playerRadius }, wall).collided) {
                        collisionWithBoundary = true;
                        break; // Достаточно одного столкновения с границей
                    }
                }
            }
            
            // --- НОВАЯ ПРОВЕРКА: Расстояние до Хищника ---
            tooCloseToPredator = false; // Сбрасываем флаг в начале проверки
            if (predator) { // Проверяем только если Хищник есть
                const dxPred = spawnX - predator.x;
                const dyPred = spawnY - predator.y;
                const distSqPred = dxPred * dxPred + dyPred * dyPred;
                if (distSqPred < MIN_SPAWN_DISTANCE_FROM_PREDATOR_SQ) {
                    tooCloseToPredator = true;
                }
            }
            // --- КОНЕЦ ПРОВЕРКИ РАССТОЯНИЯ ---

            // Продолжаем цикл, если точка НЕ внутри полигона ИЛИ есть столкновение с границей ИЛИ слишком близко к Хищнику
        } while (!isPointInsidePolygon({ x: spawnX, y: spawnY }, boundaryVertices) || collisionWithBoundary || tooCloseToPredator);

        // console.log(`Spawn point found after ${attempts} attempts: (${spawnX.toFixed(0)}, ${spawnY.toFixed(0)})`);
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
            lastFakeTrailTime: 0, // Для кулдауна ложного следа Хищника
            isSprinting: false,
            isAiming: false
        };

        // Если присоединился ОХОТНИК, обновляем здоровье Хищника
        if (!isPredator) {
            const predatorId = Object.keys(players).find(id => id !== socket.id && players[id].isPredator);
            if (predatorId) {
                const newPredatorMaxHealth = calculatePredatorMaxHealth(Object.keys(players).length);
                players[predatorId].maxHealth = newPredatorMaxHealth;
                players[predatorId].health = newPredatorMaxHealth; // Исцеляем до нового максимума
                // console.log(`Predator ${players[predatorId].name} health updated to ${newPredatorMaxHealth} due to new Hunter.`);
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
        // console.log(`Player \"${playerName}\" (${socket.id}) joined. Total players: ${Object.keys(players).length}`);
    });

    // Обработка получения ввода от клиента
    socket.on('playerInput', (inputData) => {
        const player = players[socket.id];
        if (!player) return; 

        // Сохраняем весь объект input, включая isShiftDown и isAiming
        player.input = inputData; 
        player.angle = inputData.angle; // Обновляем угол напрямую
        // player.isSprinting = !!(inputData.keys.w || inputData.keys.s); // Старая логика - УДАЛИТЬ ИЛИ ЗАКОММЕНТИТЬ?
        // player.isAiming = !!inputData.isAiming; // Старая логика
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

        // console.log(`Player ${socket.id} shoots!`);
        player.lastShotTime = now; // Обновляем время последнего выстрела
        player.ammo--; // Уменьшаем патроны

        // Создаем пули для дробовика
        for (let i = 0; i < shotgunPellets; i++) {
            const spreadAngle = player.angle + (Math.random() - 0.5) * shotgunSpread;
            const startX = player.x + Math.cos(player.angle) * (playerRadius + 5);
            const startY = player.y + Math.sin(player.angle) * (playerRadius + 5);

            const newBullet = {
                id: nextBulletId++,
                ownerId: socket.id, // Добавляем ID владельца
                x: startX,
                y: startY,
                angle: spreadAngle,
                speed: bulletSpeed,
                radius: bulletRadius, // Используем радиус пули
                damage: bulletDamage, // Используем урон пули
                spawnTime: Date.now(),
                lifetime: bulletLifetime,
                hasPenetrated: false, // <-- Флаг для пробития стены
                // isActive: true // <-- REMOVED isActive flag
            };
            bullets.push(newBullet);
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
            // console.log(`[Attack] Predator ${player.name} (${socket.id}) initiated attack.`);
            
            let hitDetected = false; // Флаг, что мы кого-то ударили
            // --- Логика поиска цели и урона --- 
            for (const targetId in players) {
                if (targetId === socket.id) continue; // Не атакуем себя
                const target = players[targetId];
                // Атакуем только живых Охотников
                if (target && !target.isPredator && target.health > 0) { // Добавили проверку на существование target
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
                            // console.log(`[Attack Hit] Predator ${player.name} hit ${target.name}`);
                            target.health -= predatorAttackDamage;
                            // target.health = Math.max(0, target.health); // Не уходим в минус - Math.max убран, проверка смерти ниже
                            // gameStateUpdate отправит новое здоровье всем
                            
                            // --- ПРОВЕРКА СМЕРТИ ПОСЛЕ АТАКИ ХИЩНИКА ---
                            if (target.health <= 0) {
                                // Отправляем событие конкретному игроку ПЕРЕД удалением
                                console.log(`[Server] Predator kill: Emitting 'youDied' to ${target.id} (Killer: Predator)`); // DEBUG LOG
                                io.to(target.id).emit('youDied', { killerType: 'Predator' });
                                handlePlayerDeath(target); // Обрабатываем смерть немедленно
                                // target уже удален из players внутри handlePlayerDeath, дальнейшая обработка не нужна для него в этом цикле
                            }
                            // --- КОНЕЦ ПРОВЕРКИ СМЕРТИ ---
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

    // --- Обработчик сбора бонуса --- 
    socket.on('collectBonusRequest', (bonusId) => {
        const player = players[socket.id];
        // Ищем бонус по ID
        const bonusIndex = bonuses.findIndex(b => b.id === bonusId);

        if (!player || player.isPredator || bonusIndex === -1) {
            // Игрок не найден, Хищник пытается собрать, или бонус уже собран/не существует
            return; 
        }

        const bonus = bonuses[bonusIndex];
        // console.log(`[Bonus Collect] Player ${player.name} requests collection of bonus ${bonus.id}`);

        // Выдаем награду (патроны)
        let ammoGain = 0;
        if (bonus.type === 'ammo' && bonus.amount) {
            ammoGain = bonus.amount;
        } else {
            // Старый бонус (или тип не указан) - даем случайное кол-во
            ammoGain = Math.floor(Math.random() * 4) + 2; 
        }
        
        player.ammo = Math.min(player.maxAmmo, player.ammo + ammoGain);
        // console.log(`[Bonus Collect] Player ${player.name} gained ${ammoGain} ammo (Type: ${bonus.type || 'night'}). Current: ${player.ammo}/${player.maxAmmo}`);
        
        // Удаляем бонус из массива
        bonuses.splice(bonusIndex, 1);

        // Оповещаем всех клиентов, что бонус собран
        io.emit('bonusCollected', bonusId);
    });

    // Обработка отключения
    socket.on('disconnect', () => {
        // console.log(`User disconnected: ${socket.id}`);
        const player = players[socket.id];
        if (player) {
            // console.log(`Player \"${player.name}\" (${socket.id}) left.`);
            const wasPredator = player.isPredator;
            
            // Если отключается ОХОТНИК, обновляем здоровье Хищника
            if (!wasPredator) {
                const predatorId = Object.keys(players).find(id => id !== socket.id && players[id].isPredator);
                if (predatorId) {
                    // Пересчитываем до удаления игрока
                    const newPredatorMaxHealth = calculatePredatorMaxHealth(Object.keys(players).length - 1);
                    players[predatorId].maxHealth = newPredatorMaxHealth;
                    players[predatorId].health = Math.min(players[predatorId].health, newPredatorMaxHealth);
                    // console.log(`Predator ${players[predatorId].name} health updated to ${newPredatorMaxHealth} due to Hunter leaving.`);
                }
            } else {
                 // console.log("Predator disconnected! Resetting assignment.");
                 predatorAssigned = false;
            }
            
            delete players[socket.id];
            io.emit('playerDisconnected', socket.id); 
            // console.log(`Total players: ${Object.keys(players).length}`);
        }
    });
});

// --- Функция обработки смерти игрока ---
function handlePlayerDeath(player) {
    if (!player || !players[player.id]) return; // Проверяем, существует ли игрок еще
    const playerId = player.id; // Сохраняем ID перед удалением
    const playerName = player.name; // Сохраняем имя для лога
    console.log(`[Server] handlePlayerDeath START for ${playerName} (${playerId})`); // DEBUG LOG

    // 1. Выпадение патронов (если Охотник)
    if (!player.isPredator && player.ammo > 0) {
        const ammoBonus = {
            id: nextBonusId++, 
            x: player.x, 
            y: player.y,
            type: 'ammo',
            amount: player.ammo
        };
        bonuses.push(ammoBonus);
        // console.log(`[Ammo Drop] Hunter ${player.name} died, dropped ${player.ammo} ammo.`);
    }

    // 2. Сброс флага Хищника, если он умер
    const wasPredator = player.isPredator;
    if (wasPredator) {
        // console.log("Predator died! Resetting assignment.");
        predatorAssigned = false;
    }

    // 3. Пересчет здоровья Хищника, если умер Охотник
    const wasHunter = !wasPredator;
    // Удаляем игрока ДО пересчета
    if (players[playerId]) {
        console.log(`[Server] Deleting player ${playerName} (${playerId}) from players object...`); // DEBUG LOG
        delete players[playerId]; 
        console.log(`[Server] Player ${playerName} (${playerId}) deleted? Check: ${!players[playerId]}`); // DEBUG LOG
    } else {
        console.warn(`[Server] handlePlayerDeath: Player ${playerName} (${playerId}) already deleted?`); // DEBUG LOG
    }
    
    if (wasHunter) {
        const predatorId = Object.keys(players).find(id => players[id].isPredator); // Ищем Хищника среди ОСТАВШИХСЯ
        if (predatorId) {
            const numPlayersRemaining = Object.keys(players).length;
            const newPredatorMaxHealth = calculatePredatorMaxHealth(numPlayersRemaining);
            players[predatorId].maxHealth = newPredatorMaxHealth;
            players[predatorId].health = Math.min(players[predatorId].health, newPredatorMaxHealth);
            // console.log(`Predator ${players[predatorId].name} health updated to ${newPredatorMaxHealth} due to Hunter death.`);
        }
    }

    // 4. Оповещение клиентов о смерти
    io.emit('playerDied', playerId); 
    // console.log(`Player ${playerId} removed due to death. Total players: ${Object.keys(players).length}`);
    console.log(`[Server] handlePlayerDeath END for ${playerName} (${playerId}). Emitted 'playerDied'.`); // DEBUG LOG
}

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
    const moveDistance = bullet.speed * dt;
    bullet.x += Math.cos(bullet.angle) * moveDistance;
    bullet.y += Math.sin(bullet.angle) * moveDistance;

    // Проверка истечения времени жизни
    if (Date.now() - bullet.spawnTime > bullet.lifetime) {
        return true; // Пометить на удаление
    }

    // Проверка столкновений со стенами
    for (const wall of walls) {
        const collisionResult = checkCircleWallCollision(bullet, wall);
        if (collisionResult.collided) {
            // --- Логика пробития --- 
            if (bullet.hasPenetrated) {
                // Уже пробила одну стену, удаляем
                return true; 
            } else {
                // Первая стена
                const penetrationChance = Math.random();
                if (penetrationChance < 0.5) {
                    // Пробила! (50% шанс)
                    bullet.hasPenetrated = true;
                    // НЕ возвращаем true, пуля летит дальше
                } else {
                    // Не пробила (50% шанс), удаляем
                    return true; 
                }
            }
            // --- Конец логики пробития ---
            // return true; // Старая логика: удаляем при любом столкновении
        }
    }
    // TODO: Добавить проверку столкновений с игроками (кроме владельца)

    return false; // Не удалять пулю
}

// --- Серверный игровой цикл --- 
const TICK_RATE = 30; 
setInterval(() => {
    const now = Date.now();
    const dt = (1000 / TICK_RATE) / 1000; 

    // 0. Сохраняем предыдущее состояние здоровья (для проверки смерти)
    /* // <-- Удаляем логику healthBeforeTick
    Object.values(players).forEach(player => {
        player.healthBeforeTick = player.health;
    });
    */

    // 1. Обновляем всех игроков (движение, атаки Хищника применяются здесь неявно через lastAttackTime)
    Object.values(players).forEach(player => {
        updatePlayer(player, dt);
    });

    // 2. Обновляем все пули и проверяем столкновения Пуля-Стена
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        let shouldRemoveBullet = updateBullet(bullet, dt, serverWalls);

        // Если пуля еще не удалена (жива и не пробила/ударилась), проверяем столкновения с игроками
        if (!shouldRemoveBullet) {
            Object.values(players).forEach(player => {
                if (!player || player.health <= 0) return; // Пропускаем отсутствующих или мертвых
                if (bullet.ownerId === player.id) return; // Не сталкиваемся с собой

                const dx = bullet.x - player.x;
                const dy = bullet.y - player.y;
                const distSq = dx * dx + dy * dy;
                const radiiSumSq = (bullet.radius + playerRadius) * (bullet.radius + playerRadius);

                if (distSq < radiiSumSq) {
                    // Столкновение!
                    player.health -= bullet.damage;
                    shouldRemoveBullet = true; // Помечаем пулю на удаление после попадания
                    
                    // --- ПРОВЕРКА СМЕРТИ ПОСЛЕ ПОПАДАНИЯ ПУЛИ ---
                    if (player.health <= 0) {
                        // Определяем тип убийцы (владельца пули)
                        const killer = players[bullet.ownerId];
                        const killerType = killer ? (killer.isPredator ? 'Predator' : 'Hunter') : 'Unknown'; // Если владелец не найден
                        // Отправляем событие конкретному игроку ПЕРЕД удалением
                        console.log(`[Server] Bullet kill: Emitting 'youDied' to ${player.id} (Killer: ${killerType})`); // DEBUG LOG
                        io.to(player.id).emit('youDied', { killerType: killerType }); 
                        
                        handlePlayerDeath(player); // Обрабатываем смерть немедленно
                        // player будет удален из players внутри handlePlayerDeath
                    }
                    // --- КОНЕЦ ПРОВЕРКИ СМЕРТИ ---
                    
                    // Не используем return здесь, чтобы одна пуля могла теоретически попасть в нескольких (хотя маловероятно)
                }
            });
        }

        // Если пулю нужно удалить (из updateBullet или после попадания в игрока)
        if (shouldRemoveBullet) {
            bullets.splice(i, 1); // Удаляем пулю из массива
        }
    }
    
    // 3. Проверка смерти и выпадение патронов (ПОСЛЕ всех обновлений) <-- УДАЛЯЕМ ЭТОТ БЛОК
    /*
    Object.values(players).forEach(player => {
        if (player.healthBeforeTick > 0 && player.health <= 0 && !player.isPredator) {
            // Игрок только что умер и это Охотник
            if (player.ammo > 0) {
                 const ammoBonus = {
                    id: nextBonusId++, 
                    x: player.x, 
                    y: player.y,
                    type: 'ammo',
                    amount: player.ammo
                };
                bonuses.push(ammoBonus);
                // console.log(`[Ammo Drop] Hunter ${player.name} died (Health ${player.healthBeforeTick} -> ${player.health}), dropped ${player.ammo} ammo.`);
            }
            // Можно добавить другую логику смерти здесь (например, запуск таймера возрождения)
        }
    });
    */

    // 4. Обновляем время цикла дня/ночи
    const previousCycleTime = currentCycleTime;
    currentCycleTime = (currentCycleTime + (1000 / TICK_RATE)) % DAY_NIGHT_CYCLE_DURATION;
    // Если время стало меньше, значит цикл завершился
    if (currentCycleTime < previousCycleTime) {
        cycleCounter++;
        // console.log(`[Cycle] New cycle started: ${cycleCounter}`);
    }

    // --- Логика спавна бонусов при наступлении ночи --- 
    const isNightNow = currentCycleTime < DAY_NIGHT_CYCLE_DURATION / 2;
    if (!wasNight && isNightNow) { // Если только что наступила ночь
        // console.log("[Night Bonus Spawn] Night has begun. Checking bonuses...");
        const numPlayers = Object.keys(players).length;
        const bonusesToSpawn = Math.max(0, numPlayers - bonuses.length);
        // console.log(`Players: ${numPlayers}, Current Bonuses: ${bonuses.length}, Need to spawn: ${bonusesToSpawn}`);

        if (bonusesToSpawn > 0) {
            const boundaryVertices = mapGenerator.getBoundaryVertices();
            // --- Находим Хищника ЗДЕСЬ, перед циклом спавна ---
            let predator = null;
            const predatorId = Object.keys(players).find(id => players[id] && players[id].isPredator);
            if (predatorId) {
                predator = players[predatorId];
            }
            // --- Конец поиска Хищника ---
            let spawnedCount = 0;
            let attemptsTotal = 0; // Защита от бесконечного цикла спавна
            const maxSpawnTotalAttempts = bonusesToSpawn * 100; // Макс попыток на все бонусы

            while (spawnedCount < bonusesToSpawn && attemptsTotal < maxSpawnTotalAttempts) {
                let spawnX, spawnY;
                let isValidSpawn = false;
                let spawnAttempts = 0;
                const maxSpawnPointAttempts = 50; // Макс попыток на ОДНУ точку

                do {
                    spawnAttempts++;
                    attemptsTotal++;
                    // Генерируем точку с отступом от краев
                    spawnX = BONUS_SPAWN_PADDING + Math.random() * (worldWidth - 2 * BONUS_SPAWN_PADDING);
                    spawnY = BONUS_SPAWN_PADDING + Math.random() * (worldHeight - 2 * BONUS_SPAWN_PADDING);
                    
                    // 1. Проверка внутри полигона
                    if (!isPointInsidePolygon({ x: spawnX, y: spawnY }, boundaryVertices)) {
                        continue; // Не внутри, следующая попытка
                    }

                    // 2. Проверка столкновения со ВСЕМИ стенами (с буфером)
                    let collisionWithWall = false;
                    for (const wall of serverWalls) {
                        if (checkCircleWallCollision({ x: spawnX, y: spawnY, radius: BONUS_WALL_BUFFER }, wall).collided) {
                            collisionWithWall = true;
                            break;
                        }
                    }
                    if (collisionWithWall) {
                        continue; // Слишком близко к стене, следующая попытка
                    }

                    // 3. Проверка расстояния до других бонусов
                    let tooCloseToOtherBonus = false;
                    for (const existingBonus of bonuses) {
                        const dxBonus = spawnX - existingBonus.x;
                        const dyBonus = spawnY - existingBonus.y;
                        const distSqBonus = dxBonus * dxBonus + dyBonus * dyBonus;
                        if (distSqBonus < MIN_BONUS_DISTANCE_SQ) {
                            tooCloseToOtherBonus = true;
                            break;
                        }
                    }
                    if (tooCloseToOtherBonus) {
                        continue; // Слишком близко к другому бонусу
                    }

                    // --- НОВАЯ ПРОВЕРКА: Расстояние до Хищника ---
                    let tooCloseToPredator = false;
                    if (predator) { // Проверяем только если Хищник есть
                        const dxPred = spawnX - predator.x;
                        const dyPred = spawnY - predator.y;
                        const distSqPred = dxPred * dxPred + dyPred * dyPred;
                        if (distSqPred < MIN_SPAWN_DISTANCE_FROM_PREDATOR_SQ) {
                            tooCloseToPredator = true;
                        }
                    }
                    // --- КОНЕЦ ПРОВЕРКИ РАССТОЯНИЯ ---

                    isValidSpawn = true; // Точка подходит

                } while (!isValidSpawn && spawnAttempts < maxSpawnPointAttempts && attemptsTotal < maxSpawnTotalAttempts);

                if (isValidSpawn) {
                    const newBonus = {
                        id: nextBonusId++,
                        x: spawnX,
                        y: spawnY
                    };
                    bonuses.push(newBonus);
                    spawnedCount++;
                    // console.log(`[Night Bonus Spawn] Spawned bonus ${newBonus.id} at (${spawnX.toFixed(0)}, ${spawnY.toFixed(0)})`);
                } else {
                    // console.warn(`[Night Bonus Spawn] Failed to find valid spawn point for a bonus after ${spawnAttempts} attempts.`);
                    // Прерываем спавн, если не можем найти точку, чтобы не зациклиться
                    if (attemptsTotal >= maxSpawnTotalAttempts) {
                         // console.error(`[Night Bonus Spawn] Reached max total attempts (${maxSpawnTotalAttempts}). Stopping bonus spawn for this cycle.`);
                         break; 
                    }
                }
            }
        }
    }
    wasNight = isNightNow; // Обновляем флаг состояния ночи

    // --- Конец логики спавна бонусов ---

    // 5. Формируем gameState ПОСЛЕ всех обновлений и удалений
    // console.log("[Server] Preparing gameState. Current player IDs:", Object.keys(players)); // DEBUG LOG <-- REMOVING THIS
    const gameState = {
        players: Object.values(players).map(p => {
            // Добавим проверку на существование p, на всякий случай
            if (!p) return null; // Пропустить, если игрок как-то стал null/undefined
            const input = p.input || {}; // Защита от undefined input
            const isSprinting = !!input.isShiftDown; // Теперь зависит только от Shift
            const isAiming = !!input.isAiming;

            return {
                id: p.id,
                x: p.x,
                y: p.y,
                angle: p.angle,
                color: p.color,
                health: p.health,
                maxHealth: p.maxHealth,
                ammo: p.ammo,
                maxAmmo: p.maxAmmo,
                isSprinting: isSprinting, // Отправляем актуальный статус спринта
                isPredator: p.isPredator, 
                isAiming: isAiming, // Отправляем статус прицеливания
                name: p.name // Добавляем имя
            };
        }).filter(p => p !== null), // Убираем null значения, если вдруг появились
        bullets: Object.values(bullets).map(b => ({ id: b.id, x: b.x, y: b.y })),
        bonuses: bonuses.map(b => ({ 
            id: b.id, 
            x: b.x, 
            y: b.y, 
            type: b.type, // Отправляем тип (может быть undefined)
            amount: b.amount // Отправляем количество (если есть)
        })), 
        // --- Добавляем время цикла --- 
        cycleTime: currentCycleTime,
        cycleDuration: DAY_NIGHT_CYCLE_DURATION,
        cycleCount: cycleCounter // <-- Отправляем номер цикла
    };
    io.emit('gameStateUpdate', gameState);
}, 1000 / TICK_RATE);

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`); // <-- KEEP this log
}); 