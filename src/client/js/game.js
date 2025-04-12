import { GameEngine } from './engine/GameEngine.js';
import { Player } from './entities/Player.js';
import { Wall } from './entities/Wall.js';
import { InputHandler } from './input/InputHandler.js';
import { intersectSegments } from './utils/geometry.js'; // Импортируем утилиту
import { SpeedCircle } from './entities/SpeedCircle.js';
import { Bullet } from './entities/Bullet.js';
// Socket.io клиент
// Убедитесь, что библиотека socket.io подключена в index.html
// <script src="/socket.io/socket.io.js"></script>

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Create offscreen canvas for fog of war
        this.fogCanvas = document.createElement('canvas');
        this.fogCtx = this.fogCanvas.getContext('2d');

        this.worldWidth = 2000 * 1.3;
        this.worldHeight = 2000 * 1.3;

        this.gameEngine = new GameEngine(this.ctx);
        this.inputHandler = new InputHandler();
        
        // --- Сетевое состояние --- 
        this.socket = io(); // Подключаемся к серверу
        this.myPlayerId = null;
        this.players = {}; // { id: { x, y, angle, color, ... }, ... } - состояние от сервера
        this.playerEntities = {}; // Локальные сущности для рендеринга игроков
        this.bulletEntities = {}; // <-- Локальные сущности пуль

        // Zoom properties
        this.zoom = 1.0;
        this.minZoom = 0.3;
        this.maxZoom = 2.5;
        this.zoomSpeed = 0.001;

        // FOV properties
        this.baseWorldViewRadius = 700;
        this.currentWorldViewRadius = this.baseWorldViewRadius; 
        this.targetWorldViewRadius = this.baseWorldViewRadius; 
        this.baseFovAngle = Math.PI / 2; // 90 degrees
        this.currentFovAngle = this.baseFovAngle;
        this.targetFovAngle = this.baseFovAngle;
        this.fovTransitionSpeed = 0.1; 

        // Crosshair properties
        this.baseCrosshairRadius = 20; // Базовый радиус (увеличен)
        this.targetCrosshairRadius = this.baseCrosshairRadius;
        this.currentCrosshairRadius = this.baseCrosshairRadius;
        this.crosshairTransitionSpeed = 0.15; // Скорость изменения прицела

        this.setupSocketListeners();
        this.initGame();
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        this.lastTime = 0;
        requestAnimationFrame((time) => this.gameLoop(time));
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to server with ID:', this.socket.id);
        });

        this.socket.on('init', (data) => {
            console.log('Initialization data received:', data);
            this.myPlayerId = data.id;
            this.players = data.players;
            // Получаем стены от сервера
            this.gameEngine.clearWalls(); // Очищаем старые стены (на всякий случай)
            if (data.walls && Array.isArray(data.walls)) {
                data.walls.forEach(wallData => {
                    // Создаем сущность Wall на основе данных с сервера
                    const wall = new Wall(
                        wallData.x,
                        wallData.y,
                        wallData.length,
                        wallData.angle,
                        wallData.color // Используем цвет с сервера
                        // Ширина стены wallData.width теперь устанавливается в конструкторе Wall по умолчанию
                    );
                    this.gameEngine.addEntity(wall); 
                });
                console.log(`Added ${data.walls.length} walls from server.`);
            } else {
                console.warn("No walls data received from server or data is invalid.");
            }
            this.syncPlayerEntities(); // Синхронизируем игроков после получения начального состояния
        });

        this.socket.on('playerConnected', (playerData) => {
            console.log('Player connected:', playerData.id);
            this.players[playerData.id] = playerData;
            this.syncPlayerEntities(); 
        });

        this.socket.on('playerDisconnected', (playerId) => {
            console.log('Player disconnected:', playerId);
            delete this.players[playerId];
             if (this.playerEntities[playerId]) {
                 this.gameEngine.removeEntity(this.playerEntities[playerId]);
                 delete this.playerEntities[playerId];
            }
        });

        this.socket.on('gameStateUpdate', (gameState) => {
            // Обновляем состояние игроков
            if (gameState.players) {
                gameState.players.forEach(serverPlayer => {
                    if (this.players[serverPlayer.id]) {
                        // Просто копируем данные с сервера
                        Object.assign(this.players[serverPlayer.id], serverPlayer);
                    } else {
                        // Игрок появился между init и первым апдейтом
                        this.players[serverPlayer.id] = serverPlayer;
                    }
                });
            }
            // Обновляем пули
            if (gameState.bullets) {
                this.syncBulletEntities(gameState.bullets);
            }
             this.syncPlayerEntities(); // Обновляем локальные сущности
        });
    }

    // Синхронизирует локальные сущности с серверным состоянием players
    syncPlayerEntities() {
         // Удаляем сущности для отключившихся игроков
        for (const localId in this.playerEntities) {
            if (!this.players[localId]) {
                this.gameEngine.removeEntity(this.playerEntities[localId]);
                delete this.playerEntities[localId];
            }
        }
         // Создаем/обновляем сущности для текущих игроков
        for (const serverId in this.players) {
             const serverData = this.players[serverId];
             const isSprintingFromServer = serverData.isSprinting || false;

             if (!this.playerEntities[serverId]) {
                 // Создаем новую сущность Player 
                 const playerEntity = new Player(serverData.x, serverData.y); 
                 playerEntity.id = serverId; 
                 playerEntity.color = serverData.color; 
                 playerEntity.currentHealth = serverData.health !== undefined ? serverData.health : playerEntity.maxHealth;
                 playerEntity.ammo = serverData.ammo !== undefined ? serverData.ammo : playerEntity.ammo; 
                 playerEntity.isSprinting = isSprintingFromServer; // Сохраняем флаг спринта

                 // Привязываем обработчик кругов ВСЕМ игрокам
                 playerEntity.onSpeedCircle = (x, y) => {
                     this.gameEngine.addEffect(new SpeedCircle(x, y));
                 };
                 
                 if (serverId === this.myPlayerId) {
                     playerEntity.isSelf = true; 
                     // Локальный игрок использует свою логику tryGenerateSpeedCircle из Player.js
                 } else {
                     playerEntity.isSelf = false;
                     playerEntity.update = () => {}; // Отключаем update для других
                     playerEntity.targetX = serverData.x;
                     playerEntity.targetY = serverData.y;
                     playerEntity.targetAngle = serverData.angle;
                     playerEntity.angle = serverData.angle; 
                     // Добавляем свойства для кулдауна эффектов скорости удаленного игрока
                     playerEntity.lastSpeedCircleTime = 0; 
                     playerEntity.speedCircleCooldown = 200; // Можно настроить (ms)
                 }
                 this.playerEntities[serverId] = playerEntity;
                 this.gameEngine.addEntity(playerEntity);
                 console.log(`Created entity for ${serverId}`);
             } else {
                 // Обновляем существующую сущность
                 const localEntity = this.playerEntities[serverId];
                 localEntity.isSprinting = isSprintingFromServer; // Обновляем флаг спринта

                 if (serverId !== this.myPlayerId) {
                     // Обновляем цель для интерполяции
                     localEntity.targetX = serverData.x;
                     localEntity.targetY = serverData.y;
                     localEntity.targetAngle = serverData.angle;
                 } else {
                     // Обновляем нашего игрока
                     localEntity.x = serverData.x;
                     localEntity.y = serverData.y;
                 }
                 localEntity.color = serverData.color; 
                 localEntity.currentHealth = serverData.health !== undefined ? serverData.health : localEntity.currentHealth; 
                 localEntity.ammo = serverData.ammo !== undefined ? serverData.ammo : localEntity.ammo; 
             }
         }
         // Убедимся, что ссылка this.player указывает на нашу сущность
         if (this.myPlayerId && this.playerEntities[this.myPlayerId]) {
             this.player = this.playerEntities[this.myPlayerId];
              // Привязываем обработчик кругов здесь, после создания сущности
             if (!this.player.onSpeedCircle) { // Если еще не привязан
                this.player.onSpeedCircle = (x, y) => {
                    this.gameEngine.addEffect(new SpeedCircle(x, y));
                };
             }
         } else {
             this.player = null; // Если нашей сущности еще нет
         }
    }

    // --- Синхронизация пуль --- 
    syncBulletEntities(serverBullets) {
        const serverBulletIds = new Set(serverBullets.map(b => b.id));

        // 1. Удаляем локальные пули, которых больше нет на сервере
        for (const localId in this.bulletEntities) {
            if (!serverBulletIds.has(parseInt(localId))) { // ID пули - число
                this.gameEngine.removeBullet(this.bulletEntities[localId]); // Нужен метод в GameEngine
                delete this.bulletEntities[localId];
            }
        }

        // 2. Создаем/обновляем локальные пули
        serverBullets.forEach(serverBullet => {
            if (!this.bulletEntities[serverBullet.id]) {
                // Создаем новую сущность Bullet
                const bulletEntity = new Bullet(serverBullet.x, serverBullet.y);
                // Можно добавить ownerId, если понадобится
                // bulletEntity.ownerId = serverBullet.ownerId; 
                this.bulletEntities[serverBullet.id] = bulletEntity;
                this.gameEngine.addBullet(bulletEntity); // Добавляем в движок для рендеринга
            } else {
                // Обновляем существующую (пока напрямую, позже можно интерполировать)
                const localBullet = this.bulletEntities[serverBullet.id];
                localBullet.x = serverBullet.x;
                localBullet.y = serverBullet.y;
                // Угол/скорость не обновляем, т.к. сервер их не шлет
            }
        });
    }

    initGame() {
        // НЕ создаем игрока здесь, ждем 'init' от сервера
        console.log("Initializing game locally...");
        // ГЕНЕРАЦИЯ СТЕН ПЕРЕНЕСЕНА: теперь стены приходят от сервера в 'init'
        // const mapGenerator = new MapGenerator(this.worldWidth, this.worldHeight);
        // const boundaryWalls = mapGenerator.getWalls();
        // boundaryWalls.forEach(wall => { this.gameEngine.addEntity(wall); });
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        // Also resize the offscreen fog canvas
        this.fogCanvas.width = this.canvas.width;
        this.fogCanvas.height = this.canvas.height;
    }

    // Новый метод для интерполяции сущностей (вызывается в gameLoop)
    interpolateEntities(interpolationFactor = 0.15) {
        const now = performance.now(); // Получаем текущее время один раз
        for (const id in this.playerEntities) {
            const entity = this.playerEntities[id];
            if (!entity.isSelf) { // Интерполируем и генерируем эффекты только для других игроков
                if (entity.targetX !== undefined) {
                    // Интерполяция X, Y, Angle (как и раньше)
                    entity.x += (entity.targetX - entity.x) * interpolationFactor;
                    entity.y += (entity.targetY - entity.y) * interpolationFactor;
                    let angleDiff = entity.targetAngle - entity.angle;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    entity.angle += angleDiff * interpolationFactor;
                    while (entity.angle > Math.PI) entity.angle -= Math.PI * 2;
                    while (entity.angle < -Math.PI) entity.angle += Math.PI * 2;
                }

                // --- Генерация кругов скорости для удаленных игроков --- 
                if (entity.isSprinting && entity.onSpeedCircle) { // Если игрок спринтует и есть обработчик
                    // Логика tryGenerateSpeedCircle прямо здесь
                    if (now - entity.lastSpeedCircleTime > entity.speedCircleCooldown) {
                        entity.lastSpeedCircleTime = now;
                        entity.onSpeedCircle(entity.x, entity.y); // Вызываем обработчик
                    }
                }
            }
        }
    }

    gameLoop(timestamp) {
        const deltaTime = (timestamp - this.lastTime) || 0; 
        this.lastTime = timestamp;

        // Update game state and get input
        const input = this.update(deltaTime);

        // Interpolate other players' positions
        this.interpolateEntities(); 
        
        // Render game, passing the input
        this.render(input); 
        
        requestAnimationFrame((time) => this.gameLoop(time));
    }

    update(deltaTime) {
        if (!this.myPlayerId || !this.player) return; // Ничего не делаем, пока не инициализированы

        const input = this.inputHandler.getInput(); 

        // --- Обновляем Zoom, FOV, Crosshair (локально) ---
        if (input.wheelDelta !== 0) {
            this.zoom -= input.wheelDelta * this.zoomSpeed;
            this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));
        }

        // --- Update Target FOV Radius & Angle based on RMB ---
        if (input.isRightMouseDown) {
            this.targetWorldViewRadius = this.baseWorldViewRadius * 1.3; // Increase radius
            this.targetFovAngle = Math.PI / 3; // Narrow angle to 60 degrees
            this.targetCrosshairRadius = this.baseCrosshairRadius / 2; 
        } else {
            this.targetWorldViewRadius = this.baseWorldViewRadius * 0.8; // Decrease radius
            this.targetFovAngle = this.baseFovAngle; // Restore base angle (90 degrees)
            this.targetCrosshairRadius = this.baseCrosshairRadius; 
        }

        // --- Smoothly Interpolate Current FOV Radius & Angle ---
        this.currentWorldViewRadius += (this.targetWorldViewRadius - this.currentWorldViewRadius) * this.fovTransitionSpeed;
        this.currentFovAngle += (this.targetFovAngle - this.currentFovAngle) * this.fovTransitionSpeed;

        // --- Update Target & Interpolate Crosshair Radius ---
        this.currentCrosshairRadius += (this.targetCrosshairRadius - this.currentCrosshairRadius) * this.crosshairTransitionSpeed;

        // --- Calculate World Mouse Coordinates ---
        const cameraX = this.canvas.width / 2 - this.player.x * this.zoom;
        const cameraY = this.canvas.height / 2 - this.player.y * this.zoom;
        const worldMouseX = (input.rawMouseX - cameraX) / this.zoom;
        const worldMouseY = (input.rawMouseY - cameraY) / this.zoom;
        
        // Add calculated world mouse coordinates to the main input object
        input.mouse = { x: worldMouseX, y: worldMouseY }; 

        // --- Обновление своего игрока (только угол и локальные эффекты/события) ---
        if (worldMouseX !== undefined && worldMouseY !== undefined) {
            const aimDx = worldMouseX - this.player.x;
            const aimDy = worldMouseY - this.player.y;
            this.player.angle = Math.atan2(aimDy, aimDx);
        }
        
        // Вызываем генерацию кругов (если нужно)
        // Локальное движение (предсказание) пока не реализуем, позиция придет с сервера
        // this.player.update(deltaTime, input, this.gameEngine.walls); // НЕ вызываем полный update
         if (input.isShiftDown && (input.keys.w || input.keys.a || input.keys.s || input.keys.d)) {
             // Вызов tryGenerateSpeedCircle перенесен в Player.update 
             // this.player.tryGenerateSpeedCircle();
         }

        // Обновляем локального игрока (включая движение для предсказания)
        this.player.update(deltaTime, input, this.gameEngine.walls);

        // --- Отправляем ввод на сервер --- 
        const inputToSend = {
            keys: input.keys,
            angle: this.player.angle, // Отправляем актуальный угол
            isShiftDown: input.isShiftDown // <-- Добавляем статус Shift
        };
        this.socket.emit('playerInput', inputToSend);

        // --- Обновляем только локальные эффекты и пули (если они создаются локально) ---
        // Пули теперь на сервере, так что gameEngine.update не нужен для них
        // this.gameEngine.update(deltaTime, input); // Вызов update у сущностей больше не нужен здесь
        this.gameEngine.effects.forEach(effect => effect.update(deltaTime));
        this.gameEngine.cleanupEffects();
        
        // --- Стрельба (отправка события на сервер) ---
        if (input.isLeftMouseClick) {
            // Отправляем событие выстрела, сервер создаст пули
            this.socket.emit('playerShoot'); 
            // const newBullets = this.player.shoot(); // Не создаем пули локально
            // if (newBullets.length > 0) {
            //     newBullets.forEach(bullet => this.gameEngine.addBullet(bullet));
            // }
        }

        // Вызываем локальный update игрока (для угла и эффектов)
        if (this.player) {
            this.player.update(deltaTime, input, this.gameEngine.walls); 
        }

        return input; // Возвращаем для render
    }

    render(input) {
        if (!this.myPlayerId || !this.player) return; // Ничего не рендерим, пока не готовы

        // --- Расчет цвета фона (используем this.player) ---
        let backgroundColor = 'rgb(78, 87, 40)';
        const healthPercent = Math.max(0, Math.min(1, this.player.currentHealth / this.player.maxHealth));
        const fullHealthColor = { r: 78, g: 87, b: 40 }; 
        const zeroHealthColor = { r: 120, g: 0, b: 0 }; 
        const r = Math.round(fullHealthColor.r + (zeroHealthColor.r - fullHealthColor.r) * (1 - healthPercent));
        const g = Math.round(fullHealthColor.g + (zeroHealthColor.g - fullHealthColor.g) * (1 - healthPercent));
        const b = Math.round(fullHealthColor.b + (zeroHealthColor.b - fullHealthColor.b) * (1 - healthPercent));
        backgroundColor = `rgb(${r}, ${g}, ${b})`;

        // Clear main canvas
        this.ctx.fillStyle = backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // --- Render world (используем this.player для центрирования) ---
        this.ctx.save(); 
        const cameraX = this.canvas.width / 2 - this.player.x * this.zoom;
        const cameraY = this.canvas.height / 2 - this.player.y * this.zoom;
        this.ctx.translate(cameraX, cameraY);
        this.ctx.scale(this.zoom, this.zoom);
        // Рендерим все сущности из gameEngine (игроки, стены)
        this.gameEngine.render(); 
        
        // --- Render UI (Ammo Count) - ВНУТРИ МАСШТАБИРУЕМОГО КОНТЕКСТА --- 
        if (this.player) { 
            const ammoCount = this.player.ammo;
            const fontSize = 14; // Фиксированный размер шрифта
            
            this.ctx.save(); // Дополнительный save/restore для текста
            this.ctx.font = `bold ${fontSize}px Arial`;
            this.ctx.fillStyle = 'white'; // Белый цвет без тени
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            // Рисуем в мировых координатах игрока
            this.ctx.fillText(ammoCount.toString(), this.player.x, this.player.y);
            this.ctx.restore(); // Восстанавливаем состояние после текста
        }

        this.ctx.restore(); // <-- Конец блока мира
        
        // --- Render Fog of War (используем this.player) --- 
        this.fogCtx.clearRect(0, 0, this.fogCanvas.width, this.fogCanvas.height);
        this.fogCtx.fillStyle = 'rgba(0, 0, 0, 1)';
        this.fogCtx.fillRect(0, 0, this.fogCanvas.width, this.fogCanvas.height);
        const playerScreenX = this.fogCanvas.width / 2;
        const playerScreenY = this.fogCanvas.height / 2;
        const numRays = 120; 
        const fovAngle = this.currentFovAngle; 
        const worldViewRadius = this.currentWorldViewRadius; 
        const angleStep = fovAngle / numRays;
        const startAngle = this.player.angle - fovAngle / 2;
        const visibilityPoints = []; 
        for (let i = 0; i <= numRays; i++) {
            const currentAngle = startAngle + i * angleStep;
            const rayEndXWorld = this.player.x + worldViewRadius * Math.cos(currentAngle);
            const rayEndYWorld = this.player.y + worldViewRadius * Math.sin(currentAngle);
            let closestHit = null;
            let minHitDistSq = worldViewRadius * worldViewRadius;
            for (const wall of this.gameEngine.walls) {
                for (let j = 0; j < wall.corners.length; j++) {
                    const corner1 = wall.corners[j];
                    const corner2 = wall.corners[(j + 1) % wall.corners.length];
                    const hit = intersectSegments(this.player.x, this.player.y, rayEndXWorld, rayEndYWorld, corner1.x, corner1.y, corner2.x, corner2.y );
                    if (hit) {
                        const dx = hit.x - this.player.x;
                        const dy = hit.y - this.player.y;
                        const distSq = dx * dx + dy * dy;
                        if (distSq < minHitDistSq) { minHitDistSq = distSq; closestHit = hit; }
                    }
                }
            }
            let finalPointWorldX, finalPointWorldY;
            if (closestHit) { finalPointWorldX = closestHit.x; finalPointWorldY = closestHit.y; }
            else { finalPointWorldX = rayEndXWorld; finalPointWorldY = rayEndYWorld; }
            const finalPointScreenX = playerScreenX + (finalPointWorldX - this.player.x) * this.zoom;
            const finalPointScreenY = playerScreenY + (finalPointWorldY - this.player.y) * this.zoom;
            visibilityPoints.push({ x: finalPointScreenX, y: finalPointScreenY });
        }
        if (visibilityPoints.length > 0) {
            this.fogCtx.beginPath(); this.fogCtx.moveTo(playerScreenX, playerScreenY); visibilityPoints.forEach(p => this.fogCtx.lineTo(p.x, p.y)); this.fogCtx.closePath();
            const screenViewRadius = this.currentWorldViewRadius * this.zoom;
            const fovGradient = this.fogCtx.createRadialGradient( playerScreenX, playerScreenY, screenViewRadius * 0.2, playerScreenX, playerScreenY, screenViewRadius );
            fovGradient.addColorStop(0, 'rgba(0, 0, 0, 1)'); fovGradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); 
            this.fogCtx.globalCompositeOperation = 'destination-out'; this.fogCtx.fillStyle = fovGradient; this.fogCtx.fill();
            const closeRadiusWorld = 140; const closeRadiusScreen = closeRadiusWorld * this.zoom;
            const closeGradient = this.fogCtx.createRadialGradient(playerScreenX, playerScreenY, 0, playerScreenX, playerScreenY, closeRadiusScreen );
            closeGradient.addColorStop(0, 'rgba(0, 0, 0, 1)'); closeGradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); 
            this.fogCtx.beginPath(); this.fogCtx.arc(playerScreenX, playerScreenY, closeRadiusScreen, 0, Math.PI * 2); this.fogCtx.closePath();
            this.fogCtx.fillStyle = closeGradient; this.fogCtx.fill();
            this.fogCtx.globalCompositeOperation = 'source-over'; 
        }
        this.ctx.drawImage(this.fogCanvas, 0, 0);
        // --- End Fog of War ---

        // --- Render World Effects OVER the fog ---
        this.ctx.save();
        this.ctx.translate(cameraX, cameraY); 
        this.ctx.scale(this.zoom, this.zoom);
        this.gameEngine.effects.forEach(effect => {
            if (effect.render) { effect.render(this.ctx); }
        });
        this.ctx.restore(); 

        // --- Render Crosshair (используем input.mouse, но в экранных координатах) ---
        if (input && input.rawMouseX !== undefined) {
            const crosshairRadius = this.currentCrosshairRadius; 
            const scaledRadius = crosshairRadius * this.zoom; 
            this.ctx.strokeStyle = '#ffffff'; 
            this.ctx.lineWidth = 1; 
            this.ctx.beginPath();
            this.ctx.arc(input.rawMouseX, input.rawMouseY, scaledRadius, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        // --- End Custom Crosshair ---
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new Game();
}); 