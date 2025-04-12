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

// --- Map Generation (скопировано из client/js/entities/MapGenerator.js) ---
// Простой класс Wall для MapGenerator'а на сервере
class ServerMapWall {
    constructor(x, y, length, angle, color = '#000000', width = 20) {
        this.x = x;
        this.y = y;
        this.length = length;
        this.angle = angle;
        this.color = color;
        this.width = width;
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

        const vertices = [];
        for (let i = 0; i < numVertices; i++) {
            const currentAngle = i * angleStep + (Math.random() - 0.5) * angleStep * 0.8;
            const currentRadius = radius * (0.8 + Math.random() * 0.4);
            const x = centerX + currentRadius * Math.cos(currentAngle);
            const y = centerY + currentRadius * Math.sin(currentAngle);
            vertices.push({ x, y });
        }

        for (let i = 0; i < numVertices; i++) {
            const start = vertices[i];
            const end = vertices[(i + 1) % numVertices]; 
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            const wallX = start.x + dx / 2;
            const wallY = start.y + dy / 2;
            // Используем ServerMapWall
            this.walls.push(new ServerMapWall(wallX, wallY, length, angle, '#000000')); 
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
             // Используем ServerMapWall
            this.walls.push(new ServerMapWall(x, y, length, angle, '#000000')); 
        }
    }

    getWalls() {
        return this.walls;
    }
}


// -- Игровое состояние на сервере --
const players = {}; // { socket.id: { id, x, y, angle, color, health, ammo, input:{keys, angle} }, ... }
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
const shootCooldown = 500; // Кулдаун выстрела в мс
const bulletSpeed = 600; // Скорость пули (пикс/сек)
const bulletLifetime = 1000; // Время жизни пули в мс
const shotgunPellets = 7; // Кол-во дробинок
const shotgunSpread = Math.PI / 12; // Разброс дроби
const bulletRadius = 2; // Добавим радиус пули для столкновений
const bulletDamage = 10; // Урон от пули

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    // Создаем нового игрока
    players[socket.id] = {
        id: socket.id,
        x: worldWidth / 2 + (Math.random() - 0.5) * 100, 
        y: worldHeight / 2 + (Math.random() - 0.5) * 100,
        angle: 0,
        color: '#000000', // <-- Все игроки черные
        health: 100, 
        ammo: 10,    
        input: { keys: {}, angle: 0, isShiftDown: false },
        lastShotTime: 0 // Добавляем время последнего выстрела для кулдауна
    };

    // Готовим данные стен для отправки (только необходимые поля)
    const wallsToSend = serverWalls.map(wall => wall.getSerializableData());

    // Отправляем новому игроку его ID, состояние игроков И СТЕНЫ
    socket.emit('init', { 
        id: socket.id,
        players: players,
        walls: wallsToSend // <-- Отправляем стены
    });

    // Отправляем всем остальным информацию о новом игроке
    socket.broadcast.emit('playerConnected', players[socket.id]);

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

    // Обработка отключения
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

// --- Логика обновления игрока на сервере ---
function updatePlayer(player, dt) {
    if (!player || !player.input) return;

    // Расчет смещения 
    let deltaX = 0;
    let deltaY = 0;
    const keys = player.input.keys || {}; 
    if (keys.w) deltaY -= playerSpeed * dt;
    if (keys.s) deltaY += playerSpeed * dt;
    if (keys.a) deltaX -= playerSpeed * dt;
    if (keys.d) deltaX += playerSpeed * dt;

    // Нормализация диагонали
    if (deltaX !== 0 && deltaY !== 0) {
        const factor = 1 / Math.sqrt(2);
        deltaX *= factor;
        deltaY *= factor;
    }

    // --- Столкновения со стенами (Pushback) ---
    let tempX = player.x + deltaX;
    let tempY = player.y + deltaY;
    
    // Используем актуальную функцию checkCircleWallCollision
    const maxPushIterations = 3;
    for (let i = 0; i < maxPushIterations; i++) {
        let collisionOccurred = false;
        for (const wall of serverWalls) { 
            const collisionResult = checkCircleWallCollision(
                { x: tempX, y: tempY, radius: playerRadius }, 
                wall // Передаем объект стены с углами
            );
            if (collisionResult.collided) {
                collisionOccurred = true;
                const pushAmount = collisionResult.overlap + 0.01;
                tempX += collisionResult.pushX * pushAmount;
                tempY += collisionResult.pushY * pushAmount;
            }
        }
        if (!collisionOccurred) break;
    }
    // Применяем позицию после выталкивания
    player.x = tempX;
    player.y = tempY;
    // --- Конец столкновений ---

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
            
            return {
                id: p.id,
                x: p.x,
                y: p.y,
                angle: p.angle,
                color: p.color, // Теперь всегда '#000000'
                health: p.health, 
                ammo: p.ammo,     
                isSprinting: isSprinting 
            };
        }),
        bullets: bullets.map(bullet => ({ // Отправляем только активные
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