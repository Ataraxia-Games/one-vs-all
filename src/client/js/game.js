import { GameEngine } from './engine/GameEngine.js';
import { Player } from './entities/Player.js';
import { Wall } from './entities/Wall.js';
import { InputHandler } from './input/InputHandler.js';
import { intersectSegments } from './utils/geometry.js';
import { SpeedCircle } from './entities/SpeedCircle.js';
import { Bullet } from './entities/Bullet.js';
import { Bonus } from './entities/Bonus.js'; // <-- Импорт бонуса
// Socket.io клиент
// Убедитесь, что библиотека socket.io подключена в index.html
// <script src="/socket.io/socket.io.js"></script>

// --- Текст правил (Глава 2) ---
const rulesTextChapter2 = `
**Как играть:**

**Цель Игры:** Игра идет, пока Хищника не убьют. Затем начинается заново.

**За Хищника:**
*   **Цель:** Выжить как можно дольше! Убивай Охотников.
*   **Атака (ЛКМ):** Ближний бой. Дальность атаки "заряжается" после удара (курсор отодвигается).
*   **Фазирование:** Проходи сквозь *внутренние* стены (не границы карты!).
*   **Осторожно:** Если Охотники убьют друг друга, ты временно потеряешь фазирование!
*   **Здоровье:** Ты становишься крепче, чем больше Охотников на сервере. Твой цвет показывает твое ХП.
*   **Ложный след (ПКМ):** Создает эффект бега в точке курсора для отвлечения.

**За Охотника:**
*   **Цель:** Нанести **последний удар** Хищнику! Побеждает только добивший.
*   **Стрельба (ЛКМ):** Бей Хищника. Патроны ограничены!
*   **Прицел (ПКМ):** Возможно, сужает обзор для большей точности (?).
*   **Другие Охотники:** Они конкуренты за финальный удар! Friendly Fire включен.
*   **Тимкилл:** Убийство союзника временно ослабит Хищника (он перестанет проходить сквозь стены), но поможет ему выжить дольше.
*   **Смерть:** Ты вернешься через время. Хочешь быстрее? Смотри рекламу!
`;

// --- Функция инициализации правил ---
function initializeRulesDisplay() {
    const rulesJoinElement = document.getElementById('rules-on-join-screen');
    const rulesIngameElement = document.getElementById('rules-ingame-overlay');

    if (rulesJoinElement) {
        rulesJoinElement.textContent = rulesTextChapter2; // Используем textContent для сохранения форматирования из `
    }
    if (rulesIngameElement) {
        rulesIngameElement.textContent = rulesTextChapter2;
    }

    // --- Слушатели для Tab --- 
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') {
            event.preventDefault(); // Предотвращаем стандартное поведение Tab
            if (rulesIngameElement) {
                rulesIngameElement.style.display = 'block'; // Показываем оверлей
            }
        }
    });

    window.addEventListener('keyup', (event) => {
        if (event.key === 'Tab') {
            if (rulesIngameElement) {
                rulesIngameElement.style.display = 'none'; // Скрываем оверлей
            }
        }
    });
}

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
        
        // --- Сетевое состояние (инициализируется позже) --- 
        this.socket = null; 
        this.myPlayerId = null;
        this.myName = ""; 
        // Добавляем isPredator в структуру players и playerEntities
        this.players = {}; // { id: { ..., name, health, ammo, isSprinting, isPredator }, ... }
        this.playerEntities = {}; // { id: PlayerEntity { ..., isPredator, getCorners()?, ... } }
        this.bulletEntities = {}; 
        this.bonusEntities = {}; // <-- Для хранения сущностей бонусов

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

        // Predator attack properties
        this.predatorAttackCharge = 1.0; // Текущий заряд атаки (0.0 - 1.0)
        this.predatorAttackChargeSpeed = 1.0; // Скорость заряда (% / сек)
        this.predatorBaseAttackRange = 75; // Базовая дальность атаки (было 50)
        this.predatorHighlightColor = null; // <-- Add property to store highlight color

        // Predator fake trail properties
        this.predatorFakeTrailCooldown = 100; // ms cooldown
        this.lastPredatorFakeTrailTime = 0; // Timestamp of last trail effect

        // --- Day/Night Cycle (controlled by server) --- 
        this.dayNightCycleDuration = 120 * 1000; // Default, will be updated by server
        this.currentCycleTime = 0; // Will be updated by server
        this.currentFogAlpha = 1.0; // Initial state
        this.cycleCount = 1; // <-- Счетчик циклов

        // --- Hunter Focus Battery ---
        this.hunterFocusMax = 5000; // 5 секунд в мс
        this.hunterFocusCurrent = this.hunterFocusMax;
        this.hunterFocusDrainRate = 1000; // Единиц в секунду (полная разрядка за 5с)
        this.hunterFocusRechargeRate = 800; // Единиц в секунду (полная зарядка ~6с)
        this.hunterFocusFovMultiplier = 0.70; // 70% от базового угла

        this.dayNightTimerElement = document.getElementById('day-night-timer'); // Кэшируем элемент
        this.fullscreenButton = document.getElementById('fullscreen-btn'); // Кэшируем кнопку
        this.staticFogViewRadiusPx = 300; // Начальное значение, обновится при ресайзе

        // НЕ подключаемся и не запускаем цикл здесь
        // this.setupSocketListeners();
        // this.initGame(); 
        // this.resizeCanvas(); 
        // window.addEventListener('resize', () => this.resizeCanvas());
        // this.lastTime = 0;
    }

    // Вызывается после ввода имени
    connectAndJoin(playerName) {
        this.myName = playerName;
        // console.log(`Attempting to join as ${this.myName}`);
        this.socket = io(); // Устанавливаем соединение
        this.setupSocketListeners(); // Настраиваем слушатели

        // Отправляем имя на сервер
        this.socket.emit('joinGame', { name: this.myName });

        // Инициализация после ответа сервера
    }

    // Инициализация игры и UI после получения 'init' от сервера
    initializeGameInternal() {
        // console.log("Initializing game internally after server ack.");
        this.initGame(); // Локальная инициализация (если нужна)
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        this.lastTime = performance.now(); // Используем performance.now()
        requestAnimationFrame((time) => this.gameLoop(time));

        // Показываем канвас, скрываем UI входа
        document.getElementById('join-ui').style.display = 'none';
        this.canvas.style.display = 'block';
    }

    setupSocketListeners() {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            // Не выводим ID здесь, он придет в 'init'
            console.log('Socket connected...'); // <-- ОСТАВЛЯЕМ
        });

        this.socket.on('init', (data) => {
            // console.log('Initialization data received:', data);
            if (data.id) { 
                this.myPlayerId = data.id;
                this.players = data.players; // Теперь содержит isPredator
                this.gameEngine.clearWalls(); 
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
                    // console.log(`Added ${data.walls.length} walls from server.`);
                } else {
                    console.warn("No walls data received from server or data is invalid."); // <-- ОСТАВЛЯЕМ
                }
                this.syncPlayerEntities(); // Передаст isPredator в сущности
                this.initializeGameInternal();
            } else if (data.error) { // Обработка ошибки (например, имя занято)
                console.error("Join error:", data.error); // <-- ОСТАВЛЯЕМ
                document.getElementById('joinError').textContent = data.error;
                document.getElementById('joinError').style.display = 'block';
                this.socket.disconnect(); // Отключаемся
                this.socket = null;
            }
        });

        this.socket.on('gameStateUpdate', (gameState) => {
            if (!this.myPlayerId) return; 
            // Обновляем игроков (включая isPredator)
            if (gameState.players) {
                gameState.players.forEach(serverPlayer => {
                    if (this.players[serverPlayer.id]) {
                        Object.assign(this.players[serverPlayer.id], serverPlayer);
                    } else {
                        this.players[serverPlayer.id] = serverPlayer;
                    }
                });
            }
            // Обновляем пули
            if (gameState.bullets) {
                this.syncBulletEntities(gameState.bullets);
            }
             this.syncPlayerEntities(); // Обновит isPredator в сущностях

            // --- Обновляем время цикла с сервера --- 
            if (gameState.cycleDuration !== undefined) {
                this.dayNightCycleDuration = gameState.cycleDuration;
            }
            if (gameState.cycleTime !== undefined) {
                this.currentCycleTime = gameState.cycleTime;
            }
            if (gameState.cycleCount !== undefined) { // <-- Обновляем счетчик цикла
                this.cycleCount = gameState.cycleCount;
            }

            // --- Синхронизация бонусов ---
            this.syncBonusEntities(gameState.bonuses || []);
        });
        
        this.socket.on('playerConnected', (playerData) => {
            if (!this.myPlayerId) return;
            console.log('Player connected:', playerData.id, playerData.name, `Predator: ${playerData.isPredator}`); // <-- ОСТАВЛЯЕМ
            this.players[playerData.id] = playerData; // Добавляем со всеми полями
            this.syncPlayerEntities(); // Создаст сущность с isPredator
        });

        this.socket.on('playerDisconnected', (playerId) => {
             if (!this.myPlayerId) return;
            console.log('Player disconnected:', playerId); // <-- ОСТАВЛЯЕМ
             // Удаляем из players
            if (this.players[playerId]) {
                 // console.log(`Removing player ${this.players[playerId].name} from list.`);
                 delete this.players[playerId];
             }
             // Удаляем сущность
             if (this.playerEntities[playerId]) {
                 this.gameEngine.removeEntity(this.playerEntities[playerId]);
                 delete this.playerEntities[playerId];
            }
        });
        
        // TODO: Добавить обработчик 'disconnect' для возврата к экрану входа
        this.socket.on('disconnect', (reason) => {
            console.warn(`Disconnected from server: ${reason}`); // <-- ОСТАВЛЯЕМ
            this.handleDisconnectionOrDeath("Отключен от сервера");
        });

        // --- Обработчик ошибки входа (например, имя занято) ---
        this.socket.on('joinError', (data) => {
            console.error("Join Error Received:", data.message); // <-- ОСТАВЛЯЕМ
            const joinErrorElement = document.getElementById('joinError');
            const nameInput = document.getElementById('playerNameInput');
            const joinButton = document.getElementById('joinButton');

            if (joinErrorElement) {
                joinErrorElement.textContent = data.message || "Ошибка входа";
                joinErrorElement.style.display = 'block';
            }
            // Разблокируем UI
            if (nameInput) nameInput.disabled = false;
            if (joinButton) {
                joinButton.disabled = false;
                joinButton.textContent = 'Присоединиться';
            }
            // Можно добавить фокус обратно на поле ввода
             if (nameInput) nameInput.focus(); 
            // НЕ отключаем сокет здесь, позволяем пользователю исправить
        });

        // --- НОВЫЙ ОБРАБОТЧИК СОЗДАНИЯ ЭФФЕКТОВ ---
        this.socket.on('createEffect', (data) => {
            if (data && data.type === 'speedCircle') {
                this.gameEngine.addEffect(new SpeedCircle(data.x, data.y));
            } // Можно добавить другие типы эффектов позже
        });

        // --- Обработчик собранного бонуса --- 
        this.socket.on('bonusCollected', (bonusId) => {
            const bonusEntity = this.bonusEntities[bonusId];
            if (bonusEntity) {
                // console.log(`[Bonus Client] Removing collected bonus ${bonusId}`);
                this.gameEngine.removeEntity(bonusEntity); // Удаляем из движка
                delete this.bonusEntities[bonusId];
            }
        });
    }

    // Синхронизирует локальные сущности с серверным состоянием players
    syncPlayerEntities() {
        const serverPlayerIds = new Set(Object.keys(this.players));

        // 1. Удаляем локальные сущности отсутствующих игроков
        for (const localId in this.playerEntities) {
            if (!serverPlayerIds.has(localId)) {
                this.gameEngine.removeEntity(this.playerEntities[localId]);
                delete this.playerEntities[localId];
            }
        }

        // 2. Создаем/обновляем локальные сущности
        for (const serverId in this.players) {
             const serverData = this.players[serverId];
             const isSprintingFromServer = serverData.isSprinting || false;
             const isPredatorFromServer = serverData.isPredator || false; // Получаем флаг

             if (!this.playerEntities[serverId]) {
                 // Создаем новую сущность Player 
                 const playerEntity = new Player(serverData.x, serverData.y);
                 playerEntity.id = serverId;
                 playerEntity.name = serverData.name; // Сохраняем имя (может пригодиться)
                 playerEntity.isPredator = isPredatorFromServer; // <-- Сохраняем роль
                 playerEntity.color = serverData.color;
                 playerEntity.currentHealth = serverData.health !== undefined ? serverData.health : playerEntity.maxHealth;
                 playerEntity.ammo = serverData.ammo !== undefined ? serverData.ammo : playerEntity.ammo;
                 playerEntity.isSprinting = isSprintingFromServer;
                 playerEntity.isAiming = serverData.isAiming || false; // <-- Добавляем флаг прицеливания
                 playerEntity.maxAmmo = serverData.maxAmmo || 100;
                 playerEntity.maxHealth = serverData.maxHealth || 100;
                 playerEntity.currentHealth = serverData.health;
                 playerEntity.isPredator = serverData.isPredator || false;
                 playerEntity.isAiming = serverData.isAiming || false; // <-- Добавляем флаг прицеливания
                 playerEntity.ammo = serverData.ammo;
                 playerEntity.maxAmmo = serverData.maxAmmo;
                 playerEntity.name = serverData.name || ""; // Сохраняем имя

                 // --- Инициализация кулдауна эффекта скорости для ВСЕХ --- 
                 playerEntity.lastSpeedCircleTime = 0;
                 playerEntity.speedCircleCooldown = 200; // Можно настроить (ms)

                 if (serverId === this.myPlayerId) {
                     playerEntity.isSelf = true; 
                 } else {
                     playerEntity.isSelf = false;
                     playerEntity.update = () => {}; // Отключаем update для других
                     playerEntity.targetX = serverData.x;
                     playerEntity.targetY = serverData.y;
                     playerEntity.targetAngle = serverData.angle;
                     playerEntity.angle = serverData.angle; 
                 }
                 this.playerEntities[serverId] = playerEntity;
                 this.gameEngine.addEntity(playerEntity);
                 // console.log(`Created entity for ${serverId}`);
             } else {
                 // Обновляем существующую сущность
                 const localEntity = this.playerEntities[serverId];
                 localEntity.isSprinting = isSprintingFromServer;
                 localEntity.isPredator = isPredatorFromServer; // <-- Обновляем роль
                 localEntity.name = serverData.name;
                 localEntity.isAiming = serverData.isAiming || false; // <-- Обновляем флаг прицеливания

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
         // Обновляем ссылку this.player, УЧИТЫВАЯ РОЛЬ
         if (this.myPlayerId && this.playerEntities[this.myPlayerId]) {
             this.player = this.playerEntities[this.myPlayerId];
             // console.log(`Local player entity set. Is Predator: ${this.player.isPredator}`); // Отладка
         } else {
             this.player = null;
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

    // --- Синхронизация бонусов --- 
    syncBonusEntities(serverBonuses) {
        const serverBonusIds = new Set(serverBonuses.map(b => b.id));

        // 1. Удаляем локальные бонусы, которых больше нет на сервере
        for (const localId in this.bonusEntities) {
            if (!serverBonusIds.has(parseInt(localId))) { 
                const bonusEntity = this.bonusEntities[localId];
                if (bonusEntity) {
                    this.gameEngine.removeEntity(bonusEntity); 
                }
                delete this.bonusEntities[localId];
            }
        }

        // 2. Создаем/обновляем локальные бонусы
        serverBonuses.forEach(serverBonus => {
            if (!this.bonusEntities[serverBonus.id]) {
                // Создаем новую сущность Bonus
                const bonusEntity = new Bonus(serverBonus.id, serverBonus.x, serverBonus.y);
                this.bonusEntities[serverBonus.id] = bonusEntity;
                this.gameEngine.addEntity(bonusEntity); // Добавляем в движок для рендеринга
            } else {
                // Обновляем существующую (только позицию, если вдруг нужно)
                const localBonus = this.bonusEntities[serverBonus.id];
                localBonus.x = serverBonus.x;
                localBonus.y = serverBonus.y;
            }
        });
    }

    initGame() {
        // НЕ создаем игрока здесь, ждем 'init' от сервера
        console.log("Initializing game locally..."); // <-- МОЖНО УДАЛИТЬ?
        // ГЕНЕРАЦИЯ СТЕН ПЕРЕНЕСЕНА: теперь стены приходят от сервера в 'init'
    }

    resizeCanvas() {
        // Закомментировано: получение высоты нижнего баннера
        // const adContainer = document.getElementById('ad-container-bottom');
        // const adHeight = adContainer ? adContainer.offsetHeight : 0;
        
        // Получаем ширину боковых баннеров
        const leftAd = document.getElementById('ad-container-left');
        const rightAd = document.getElementById('ad-container-right');
        const leftAdWidth = leftAd ? leftAd.offsetWidth : 0;
        const rightAdWidth = rightAd ? rightAd.offsetWidth : 0;

        // Рассчитываем доступное пространство
        const availableWidth = window.innerWidth - leftAdWidth - rightAdWidth;
        const availableHeight = window.innerHeight;

        // Выбираем меньшую сторону для квадрата
        const squareSize = Math.floor(Math.min(availableWidth, availableHeight)); // Округляем вниз

        // Устанавливаем размер канваса
        this.canvas.width = squareSize;
        this.canvas.height = squareSize; 
        
        // CSS (display: flex, justify-content: center на body) должен центрировать канвас

        // Resize the offscreen fog canvas
        this.fogCanvas.width = this.canvas.width;
        this.fogCanvas.height = this.canvas.height;
        // console.log(`Canvas resized to square: ${this.canvas.width}x${this.canvas.height}`); 

        // Обновляем радиус статического тумана (например, 90% от половины высоты)
        this.staticFogViewRadiusPx = Math.floor(this.canvas.height * 0.45);
        // console.log(`Static Fog View Radius updated to: ${this.staticFogViewRadiusPx}px`);
    }

    // Новый метод для интерполяции сущностей (вызывается в gameLoop)
    interpolateEntities(interpolationFactor = 0.15) {
        // const now = performance.now(); // Больше не нужно здесь
        for (const id in this.playerEntities) {
            const entity = this.playerEntities[id];
            if (!entity.isSelf) { // Интерполируем только других игроков
                if (entity.targetX !== undefined) {
                    // Интерполяция X, Y, Angle
                    entity.x += (entity.targetX - entity.x) * interpolationFactor;
                    entity.y += (entity.targetY - entity.y) * interpolationFactor;
                    let angleDiff = entity.targetAngle - entity.angle;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    entity.angle += angleDiff * interpolationFactor;
                    while (entity.angle > Math.PI) entity.angle -= Math.PI * 2;
                    while (entity.angle < -Math.PI) entity.angle += Math.PI * 2;
                }
                // --- Генерация кругов скорости УБРАНА ОТСЮДА ---
            }
        }
    }

    gameLoop(timestamp) {
        if (!this.socket || !this.myPlayerId) return; 

        // Сохраняем ID для cancelAnimationFrame
        this.animationFrameId = requestAnimationFrame((time) => this.gameLoop(time));

        const deltaTime = timestamp - this.lastTime; 
        this.lastTime = timestamp;

        const input = this.update(deltaTime);
        // Проверяем смерть ПОСЛЕ update, где может быть получен урон
        if (this.player && this.player.currentHealth <= 0) {
            this.handleDisconnectionOrDeath("Вы погибли!");
            return; // Прерываем текущий кадр
        }
        this.interpolateEntities(); 
        this.render(input); 
    }

    update(deltaTime) {
        if (!this.myPlayerId || !this.player) return {}; // Возвращаем пустой объект, если не готовы

        // --- Константа радиуса бонуса (нужна для логики сбора) ---
        const BONUS_RADIUS = 15; // Должна совпадать с серверной/Bonus.js

        // --- Обновление цикла дня/ночи (по серверным данным) --- 
        const cycleDuration = this.dayNightCycleDuration;
        const cycleTime = this.currentCycleTime;
        const halfCycle = cycleDuration / 2;
        const quarterCycle = cycleDuration / 4;

        if (cycleTime < halfCycle) {
            // Ночь (0 до 1/2)
            this.currentFogAlpha = 1.0;
        } else if (cycleTime < halfCycle + quarterCycle) {
            // Утро/Рассвет (1/2 до 3/4) - Возвращаем плавное изменение
            const timeIntoMorning = cycleTime - halfCycle;
            const morningProgressRatio = timeIntoMorning / quarterCycle;
            // Альфа идет от 1.0 (начало утра) до 0.5 (конец утра)
            this.currentFogAlpha = 1.0 - morningProgressRatio * 0.5;
        } else {
            // День/Вечер (3/4 до 1) - Возвращаем плавное изменение
            const timeIntoEvening = cycleTime - (halfCycle + quarterCycle);
            const eveningProgressRatio = timeIntoEvening / quarterCycle;
            // Альфа идет от 0.5 (начало вечера) до 1.0 (конец вечера)
            this.currentFogAlpha = 0.5 + eveningProgressRatio * 0.5;
        }

        const input = this.inputHandler.getInput(); 

        // --- Обновление батарейки фокуса Охотника ---
        if (this.player && !this.player.isPredator) {
            const dtSeconds = deltaTime / 1000;
            if (input.isRightMouseDown) {
                this.hunterFocusCurrent = Math.max(0, this.hunterFocusCurrent - this.hunterFocusDrainRate * dtSeconds);
            } else {
                this.hunterFocusCurrent = Math.min(this.hunterFocusMax, this.hunterFocusCurrent + this.hunterFocusRechargeRate * dtSeconds);
            }
        }

        // --- Обновление Zoom, FOV, Crosshair (локально) ---

        // --- Update Target FOV Radius & Angle based on RMB ---
        if (this.player && !this.player.isPredator && input.isRightMouseDown && this.hunterFocusCurrent > 0) { // Только для Охотника с зарядом
            // this.targetWorldViewRadius = this.baseWorldViewRadius * 1.3; // Increase radius <-- REMOVED
            this.targetFovAngle = this.baseFovAngle * this.hunterFocusFovMultiplier; // Уменьшенный угол
            this.targetCrosshairRadius = this.baseCrosshairRadius / 2;
        } else { // Для Хищника или если Охотник не целится / без заряда
            // this.targetWorldViewRadius = this.baseWorldViewRadius * 0.8; // Decrease radius <-- REMOVED
            this.targetFovAngle = this.baseFovAngle; // Restore base angle (90 degrees)
            this.targetCrosshairRadius = this.baseCrosshairRadius;
        }

        // --- Smoothly Interpolate Current FOV Radius & Angle ---
        // this.currentWorldViewRadius += (this.targetWorldViewRadius - this.currentWorldViewRadius) * this.fovTransitionSpeed; // Radius interpolation REMOVED as target no longer changes
        this.currentFovAngle += (this.targetFovAngle - this.currentFovAngle) * this.fovTransitionSpeed;

        // --- Update Target & Interpolate Crosshair Radius ---
        this.currentCrosshairRadius += (this.targetCrosshairRadius - this.currentCrosshairRadius) * this.crosshairTransitionSpeed;

        // --- Calculate World Mouse Coordinates ---
        const cameraX = this.canvas.width / 2 - this.player.x * this.zoom;
        const cameraY = this.canvas.height / 2 - this.player.y * this.zoom;
        const worldMouseX = (input.rawMouseX - cameraX) / this.zoom;
        const worldMouseY = (input.rawMouseY - cameraY) / this.zoom;
        
        input.mouse = { x: worldMouseX, y: worldMouseY }; 

        // --- Обновление своего игрока (предсказание и локальные действия) ---
        this.player.update(deltaTime, input, this.gameEngine.walls);

        // --- Отправляем ввод на сервер --- 
        const inputToSend = {
            keys: input.keys,
            angle: this.player.angle, // Отправляем актуальный угол
            isShiftDown: input.isShiftDown, // Статус Shift (для спринта)
            isAiming: input.isRightMouseDown // <-- Добавляем статус прицеливания
        };
        this.socket.emit('playerInput', inputToSend);

        // --- Обновление только локальных эффектов --- 
        this.gameEngine.effects.forEach(effect => effect.update(deltaTime));
        this.gameEngine.cleanupEffects();

        // --- НОВАЯ ЛОГИКА: Генерация эффектов спринта для ВСЕХ игроков --- 
        const now = performance.now();
        for (const id in this.playerEntities) {
            const entity = this.playerEntities[id];
            if (entity.isSprinting) { // Если сервер сказал, что игрок спринтует
                if (now - entity.lastSpeedCircleTime > entity.speedCircleCooldown) {
                    entity.lastSpeedCircleTime = now;
                    this.gameEngine.addEffect(new SpeedCircle(entity.x, entity.y)); // Создаем эффект
                }
            }
        }
        
        // --- Логика сбора бонусов Охотником --- 
        if (this.player && !this.player.isPredator) {
            const collectDistance = this.player.radius + BONUS_RADIUS; // Дистанция начала сбора
            const cancelBuffer = 15; // Буфер для отмены сбора при отходе

            for (const bonusId in this.bonusEntities) {
                const bonus = this.bonusEntities[bonusId];
                const dx = this.player.x - bonus.x;
                const dy = this.player.y - bonus.y;
                const distanceSq = dx * dx + dy * dy;

                if (distanceSq < collectDistance * collectDistance) {
                    // Игрок достаточно близко
                    if (!bonus.isCollecting) {
                        // Начать сбор, если еще не начат
                        // console.log(`[Bonus Client] Starting collection for bonus ${bonus.id}`);
                        bonus.isCollecting = true;
                        bonus.collectionProgress = 0;
                    }
                } else {
                     // Игрок НЕ близко
                    if (bonus.isCollecting && distanceSq > (collectDistance + cancelBuffer) * (collectDistance + cancelBuffer)) {
                         // Отменить сбор, если игрок отошел достаточно далеко
                         // console.log(`[Bonus Client] Canceled collection for bonus ${bonus.id} (too far)`);
                         bonus.isCollecting = false;
                         bonus.collectionProgress = 0;
                    }
                }

                // Обновляем прогресс, если собираем
                if (bonus.isCollecting) {
                    bonus.collectionProgress += deltaTime;
                    if (bonus.collectionProgress >= bonus.collectionDuration) {
                        // Сбор завершен, отправляем запрос на сервер
                        // console.log(`[Bonus Client] Collection complete for bonus ${bonus.id}. Sending request.`);
                        this.socket.emit('collectBonusRequest', bonus.id);
                        // Сбрасываем локальное состояние, чтобы не спамить запросы
                        // Сервер пришлет 'bonusCollected' для удаления
                        bonus.isCollecting = false; 
                        bonus.collectionProgress = 0;
                    }
                }
            }
        }

        // --- Обработка кликов мыши (отправка событий на сервер) ---
        if (input.isLeftMouseClick) {
            if (this.player && !this.player.isPredator) {
                this.socket.emit('playerShoot'); // Охотник стреляет
            } else if (this.player && this.player.isPredator) {
                // Отправляем атаку и сбрасываем заряд
                this.socket.emit('predatorAttack'); 
                this.predatorAttackCharge = 0; // Сброс заряда
            }
        }
        
        // --- Обновление заряда атаки Хищника ---
        if (this.player && this.player.isPredator) {
            this.predatorAttackCharge += this.predatorAttackChargeSpeed * (deltaTime / 1000);
            this.predatorAttackCharge = Math.min(1.0, this.predatorAttackCharge);

            // --- Способность Хищника "Ложный след" (ПКМ) ---
            if (input.isRightMouseDown) { 
                const now = performance.now(); 
                if (now - this.lastPredatorFakeTrailTime > this.predatorFakeTrailCooldown) {
                    // Отправляем событие на сервер вместо локального создания
                    this.socket.emit('predatorUsedFakeTrail', { x: input.mouse.x, y: input.mouse.y });
                    this.lastPredatorFakeTrailTime = now; 
                }
            }
        }
        
        return input; // Возвращаем input для render
    }

    render(input) {
        if (!this.myPlayerId || !this.player) return; 

        // --- Добавим лог перед проверкой фона ---

        let shouldHighlightPredator = false; // Локальная переменная для флага подсветки

        // --- Расчет цвета фона (используем this.player) ---
        let backgroundColor;
        if (this.player.isPredator) {
             backgroundColor = 'rgb(0, 0, 0)'; // Теперь черный
        } else {
            // Градиентный фон для Охотников
            const healthPercent = Math.max(0, Math.min(1, this.player.currentHealth / this.player.maxHealth));
            const fullHealthColor = { r: 78, g: 87, b: 40 }; 
            const zeroHealthColor = { r: 120, g: 0, b: 0 }; 
            const r = Math.round(fullHealthColor.r + (zeroHealthColor.r - fullHealthColor.r) * (1 - healthPercent));
            const g = Math.round(fullHealthColor.g + (zeroHealthColor.g - fullHealthColor.g) * (1 - healthPercent));
            const b = Math.round(fullHealthColor.b + (zeroHealthColor.b - fullHealthColor.b) * (1 - healthPercent));
            backgroundColor = `rgb(${r}, ${g}, ${b})`;
        }

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

        // --- Определение видимости Хищника для подсветки --- 
        let predatorEntity = null;
        for (const id in this.playerEntities) {
            if (this.playerEntities[id].isPredator) {
                predatorEntity = this.playerEntities[id];
                break;
            }
        }

        if (predatorEntity) {
            predatorEntity.forceTrueColor = false; // Сброс флага по умолчанию
            // Проверяем видимость только если текущий игрок - Охотник и целится
            if (this.player && !this.player.isPredator && input.isRightMouseDown && this.hunterFocusCurrent > 0) { 
                const dx = predatorEntity.x - this.player.x;
                const dy = predatorEntity.y - this.player.y;
                const distToPredatorSq = dx*dx + dy*dy;
                const rayEndXWorld = predatorEntity.x; // Луч прямо к Хищнику
                const rayEndYWorld = predatorEntity.y;
                let wallHit = false;
                console.log(`[Highlight Check] Player Angle: ${this.player.angle.toFixed(2)}, FOV: ${(this.currentFovAngle).toFixed(2)}`); // DEBUG
                
                for (const wall of this.gameEngine.walls) {
                     const corners = wall.getCorners ? wall.getCorners() : wall.corners;
                     if (corners && corners.length > 1) {
                        for (let j = 0; j < corners.length; j++) {
                            const corner1 = corners[j];
                            const corner2 = corners[(j + 1) % corners.length];
                            const hit = intersectSegments(this.player.x, this.player.y, rayEndXWorld, rayEndYWorld, corner1.x, corner1.y, corner2.x, corner2.y);
                            if (hit) {
                                // Проверяем, что стена БЛИЖЕ Хищника
                                const dxHit = hit.x - this.player.x;
                                const dyHit = hit.y - this.player.y;
                                const distToWallSq = dxHit*dxHit + dyHit*dyHit;
                                if (distToWallSq < distToPredatorSq - 1e-6) { // С небольшой погрешностью
                                    console.log(`[Highlight Check] Wall Hit Detected!`); // DEBUG
                                    wallHit = true;
                                    break;
                                }
                            }
                        }
                    }
                    if (wallHit) break;
                }
                
                // Проверяем, что Хищник в угле обзора
                let isInFov = false;
                if (!wallHit) {
                    const angleToPredator = Math.atan2(dy, dx);
                    const playerAngle = this.player.angle;
                    const currentFovAngle = this.currentFovAngle; // Используем текущий угол
                    let angleDiff = angleToPredator - playerAngle;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    isInFov = Math.abs(angleDiff) <= currentFovAngle / 2;
                    console.log(`[Highlight Check] Angle to Predator: ${angleToPredator.toFixed(2)}, Diff: ${angleDiff.toFixed(2)}, In FOV: ${isInFov}`); // DEBUG
                }

                if (!wallHit && isInFov) {
                     // Прямая видимость И в угле обзора - устанавливаем флаг
                     console.log(`[Highlight Check] Setting shouldHighlightPredator = true`); // DEBUG
                     // predatorEntity.forceTrueColor = true; // Устанавливаем локальную переменную
                     shouldHighlightPredator = true;
                }
            }
        }
        // --- Конец определения видимости --- 

        this.gameEngine.render(this.myPlayerId, this.player.isPredator); // <-- Передаем роль игрока

        // --- Сброс флага подсветки после рендера --- 
        if (predatorEntity) {
            predatorEntity.forceTrueColor = false;
        }

        this.ctx.restore(); // <-- Конец блока мира
        
        // --- Render UI (Ammo Count) - ВНУТРИ МАСШТАБИРУЕМОГО КОНТЕКСТА --- 
        if (this.player && !this.player.isPredator) { 
            const ammoCount = this.player.ammo;
            const fontSize = 14; // Фиксированный размер шрифта
            
            this.ctx.save(); // Дополнительный save/restore для текста
             // Рисуем текст относительно игрока, но НЕ масштабируем сам текст
            this.ctx.translate(cameraX, cameraY);
            this.ctx.scale(this.zoom, this.zoom);
            this.ctx.font = `bold ${fontSize}px Arial`;
            this.ctx.fillStyle = 'white'; // Белый цвет без тени
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            // Рисуем в мировых координатах игрока
            this.ctx.fillText(ammoCount.toString(), this.player.x, this.player.y);
            this.ctx.restore(); // Восстанавливаем состояние после текста
        }

        // --- Render Hunter FOV (для Хищника) --- 
        if (this.player && this.player.isPredator) {
            this.ctx.save();
            this.ctx.translate(cameraX, cameraY); // Используем те же значения камеры
            this.ctx.scale(this.zoom, this.zoom);
            
            // Параметры FOV Охотника (базовые и суженные)
            const hunterBaseFovAngle = Math.PI / 2; 
            const hunterBaseWorldViewRadius = 700; 
            const hunterNarrowFovAngle = Math.PI / 3; // Суженный угол (60 градусов)
            const hunterNarrowWorldViewRadius = 1000; // Увеличенная дальность прицеливания
            const numRays = 60; // Количество лучей для рейкастинга FOV

            for (const id in this.playerEntities) {
                 const entity = this.playerEntities[id];
                 // Рисуем FOV только для других игроков-Охотников
                 if (id !== this.myPlayerId && !entity.isPredator) {
                    // --- Расчет цвета (как у фона Охотника) - остается как есть ---
                    const healthPercent = Math.max(0, Math.min(1, entity.currentHealth / entity.maxHealth));
                    const fullHealthColor = { r: 78, g: 87, b: 40 }; 
                    const zeroHealthColor = { r: 120, g: 0, b: 0 }; 
                    const r = Math.round(fullHealthColor.r + (zeroHealthColor.r - fullHealthColor.r) * (1 - healthPercent));
                    const g = Math.round(fullHealthColor.g + (zeroHealthColor.g - fullHealthColor.g) * (1 - healthPercent));
                    const b = Math.round(fullHealthColor.b + (zeroHealthColor.b - fullHealthColor.b) * (1 - healthPercent));
                    
                    // --- Выбор параметров FOV на основе entity.isAiming ---
                    const isAiming = entity.isAiming; // Получаем флаг от сервера
                    const currentFovAngle = isAiming ? hunterNarrowFovAngle : hunterBaseFovAngle;
                    const currentRadius = isAiming ? hunterNarrowWorldViewRadius : hunterBaseWorldViewRadius;

                    // --- Создание градиента (с использованием currentRadius) ---
                    const fovGradient = this.ctx.createRadialGradient(
                        entity.x, entity.y, 0, 
                        entity.x, entity.y, currentRadius // Используем текущий радиус
                    );
                    fovGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.3)`);  
                    fovGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.05)`); 

                    this.ctx.fillStyle = fovGradient; 
                     
                    // --- Рейкастинг для ограничения FOV стенами --- 
                    const angle = entity.angle;
                    const startAngle = angle - currentFovAngle / 2;
                    const angleStep = currentFovAngle / numRays;
                    const visibilityPoints = [];

                    for (let i = 0; i <= numRays; i++) {
                        const currentRayAngle = startAngle + i * angleStep;
                        const rayEndXWorld = entity.x + currentRadius * Math.cos(currentRayAngle);
                        const rayEndYWorld = entity.y + currentRadius * Math.sin(currentRayAngle);
                        let closestHit = null;
                        let minHitDistSq = currentRadius * currentRadius;

                        // Проверка пересечения со стенами
                        for (const wall of this.gameEngine.walls) {
                            const corners = wall.getCorners ? wall.getCorners() : wall.corners;
                            if (corners && corners.length > 1) {
                                for (let j = 0; j < corners.length; j++) {
                                    const corner1 = corners[j];
                                    const corner2 = corners[(j + 1) % corners.length];
                                    const hit = intersectSegments(entity.x, entity.y, rayEndXWorld, rayEndYWorld, corner1.x, corner1.y, corner2.x, corner2.y);
                                    if (hit) {
                                        const dxHit = hit.x - entity.x;
                                        const dyHit = hit.y - entity.y;
                                        const distSq = dxHit * dxHit + dyHit * dyHit;
                                        if (distSq < minHitDistSq) {
                                            minHitDistSq = distSq;
                                            closestHit = hit;
                                        }
                                    }
                                }
                            }
                        }

                        // Определяем конечную точку луча
                        let finalPointWorldX, finalPointWorldY;
                        if (closestHit) {
                            finalPointWorldX = closestHit.x;
                            finalPointWorldY = closestHit.y;
                        } else {
                            finalPointWorldX = rayEndXWorld;
                            finalPointWorldY = rayEndYWorld;
                        }
                        visibilityPoints.push({ x: finalPointWorldX, y: finalPointWorldY });
                    }

                    // Рисуем полигон видимости вместо простого arc
                    this.ctx.beginPath();
                    this.ctx.moveTo(entity.x, entity.y);
                    visibilityPoints.forEach(p => this.ctx.lineTo(p.x, p.y));
                    this.ctx.closePath();
                    // Заливка остается прежней (fovGradient)
                    this.ctx.fill(); 
                 }
            }
            this.ctx.restore();
        }

        // --- Render Fog of War (для Охотника) --- 
        if (this.player && !this.player.isPredator) {
            // console.log("[Render Fog] Executing as Hunter."); // Лог
            this.fogCtx.clearRect(0, 0, this.fogCanvas.width, this.fogCanvas.height);
            this.fogCtx.fillStyle = 'rgba(0, 0, 0, 1)';
            this.fogCtx.fillRect(0, 0, this.fogCanvas.width, this.fogCanvas.height);
            const playerScreenX = this.fogCanvas.width / 2;
            const playerScreenY = this.fogCanvas.height / 2;
            const numRays = 120; // <-- ВОССТАНАВЛИВАЕМ numRays для Охотника
            const fovAngle = this.currentFovAngle; 
            // const worldViewRadius = this.currentWorldViewRadius; // Используем эффективный радиус
            
            // --- Расчет эффективного радиуса с учетом фокуса --- 
            const focusFactor = Math.max(0.1, this.hunterFocusCurrent / this.hunterFocusMax); // От 0.1 до 1.0
            const effectiveWorldViewRadius = this.currentWorldViewRadius * focusFactor;
            // --- Конец расчета --- 
            
            const angleStep = fovAngle / numRays;
            const startAngle = this.player.angle - fovAngle / 2;
            const visibilityPoints = []; 

            for (let i = 0; i <= numRays; i++) {
                const currentAngle = startAngle + i * angleStep;
                const rayEndXWorld = this.player.x + effectiveWorldViewRadius * Math.cos(currentAngle);
                const rayEndYWorld = this.player.y + effectiveWorldViewRadius * Math.sin(currentAngle);
                let closestHit = null;
                let minHitDistSq = effectiveWorldViewRadius * effectiveWorldViewRadius;

                // 1. Проверка пересечения со стенами (ВОССТАНАВЛИВАЕМ КОД)
                for (const wall of this.gameEngine.walls) {
                    // У Wall должен быть метод getSegments() или доступ к corners
                    const corners = wall.getCorners ? wall.getCorners() : wall.corners; // Адаптируемся
                    if (corners && corners.length > 1) {
                        for (let j = 0; j < corners.length; j++) {
                            const corner1 = corners[j];
                            const corner2 = corners[(j + 1) % corners.length]; // Замыкаем полигон стены
                            const hit = intersectSegments(this.player.x, this.player.y, rayEndXWorld, rayEndYWorld, corner1.x, corner1.y, corner2.x, corner2.y );
                            if (hit) {
                                const dx = hit.x - this.player.x;
                                const dy = hit.y - this.player.y;
                                const distSq = dx * dx + dy * dy;
                                if (distSq < minHitDistSq) {
                                    minHitDistSq = distSq;
                                    closestHit = hit;
                                }
                            }
                        }
                    }
                }

                // 2. Проверка пересечения с Хищником (ВОССТАНАВЛИВАЕМ КОД)
                // Мы знаем, что this.player не хищник, ищем хищника
                let predatorEntity = null;
                for (const id in this.playerEntities) {
                    if (this.playerEntities[id].isPredator) {
                        predatorEntity = this.playerEntities[id];
                        break;
                    }
                }
                if (predatorEntity && predatorEntity.getCorners) { 
                    const predatorCorners = predatorEntity.getCorners();
                    for (let j = 0; j < predatorCorners.length; j++) {
                         const corner1 = predatorCorners[j];
                         const corner2 = predatorCorners[(j + 1) % predatorCorners.length]; // Замыкаем квадрат
                         const hit = intersectSegments(this.player.x, this.player.y, rayEndXWorld, rayEndYWorld, corner1.x, corner1.y, corner2.x, corner2.y );
                         if (hit) {
                             const dx = hit.x - this.player.x;
                             const dy = hit.y - this.player.y;
                             const distSq = dx * dx + dy * dy;
                             if (distSq < minHitDistSq) { // Если Хищник ближе текущего closestHit
                                 minHitDistSq = distSq;
                                 closestHit = hit;
                             }
                         }
                    }
                }

                // Определяем конечную точку луча (ВОССТАНОВЛЕННЫЙ КОД)
                let finalPointWorldX, finalPointWorldY;
                if (closestHit) {
                    finalPointWorldX = closestHit.x;
                    finalPointWorldY = closestHit.y;
                } else {
                    finalPointWorldX = rayEndXWorld;
                    finalPointWorldY = rayEndYWorld;
                }
                // Переводим в экранные координаты для fogCanvas
                const finalPointScreenX = playerScreenX + (finalPointWorldX - this.player.x) * this.zoom;
                const finalPointScreenY = playerScreenY + (finalPointWorldY - this.player.y) * this.zoom;

                // Добавляем точку в массив для полигона видимости
                visibilityPoints.push({ x: finalPointScreenX, y: finalPointScreenY });
            }

            if (visibilityPoints.length > 0) {
                // --- Отрисовка полигона видимости --- 
                this.fogCtx.beginPath(); 
                this.fogCtx.moveTo(playerScreenX, playerScreenY); 
                visibilityPoints.forEach(p => this.fogCtx.lineTo(p.x, p.y)); 
                this.fogCtx.closePath();
                // const screenViewRadius = this.currentWorldViewRadius * this.zoom; // Используем эффективный
                const screenViewRadius = effectiveWorldViewRadius * this.zoom;
                const fovGradient = this.fogCtx.createRadialGradient( playerScreenX, playerScreenY, screenViewRadius * 0.2, playerScreenX, playerScreenY, screenViewRadius );
                fovGradient.addColorStop(0, 'rgba(0, 0, 0, 1)'); 
                fovGradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); 
                this.fogCtx.globalCompositeOperation = 'destination-out'; 
                this.fogCtx.fillStyle = fovGradient; 
                this.fogCtx.fill();
                
                // --- Ближний круг видимости (инвертированный) ---
                const closeRadiusWorld = 70; // Используем значение, которое вы установили
                // const closeRadiusScreen = closeRadiusWorld * this.zoom; // Масштабируем с учетом фокуса?
                const closeRadiusScreen = closeRadiusWorld * this.zoom * focusFactor; // Да, масштабируем
                const closeGradient = this.fogCtx.createRadialGradient( playerScreenX, playerScreenY, 0, playerScreenX, playerScreenY, closeRadiusScreen );
                closeGradient.addColorStop(0, 'rgba(0, 0, 0, 1)'); // Невидимый центр
                closeGradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Видимый край
                
                this.fogCtx.globalCompositeOperation = 'destination-out'; 
                this.fogCtx.beginPath();
                this.fogCtx.arc(playerScreenX, playerScreenY, closeRadiusScreen, 0, Math.PI * 2);
                this.fogCtx.closePath();
                this.fogCtx.fillStyle = closeGradient; 
                this.fogCtx.fill();
                this.fogCtx.globalCompositeOperation = 'source-over'; 
            }
            // Накладываем получившийся туман на основной холст
            // --- Применяем альфу тумана ТОЛЬКО для Охотника --- 
            const originalAlpha = this.ctx.globalAlpha;
            this.ctx.globalAlpha = this.currentFogAlpha; 
            this.ctx.drawImage(this.fogCanvas, 0, 0);
            this.ctx.globalAlpha = originalAlpha; // Восстанавливаем альфу
        }
        // --- End Fog of War ---

        // --- Render World Effects OVER the fog (или без него для Хищника) ---
        this.ctx.save();
        this.ctx.translate(cameraX, cameraY); 
        this.ctx.scale(this.zoom, this.zoom);
        this.gameEngine.effects.forEach(effect => {
            if (effect.render) { effect.render(this.ctx); }
        });
        this.ctx.restore(); 

        // --- Затемнение экрана при разрядке батареи фокуса Охотника ---
        if (this.player && !this.player.isPredator) {
             const dimness = 1.0 - (this.hunterFocusCurrent / this.hunterFocusMax);
             // Применяем затемнение только НОЧЬЮ
             if (dimness > 0 && this.currentFogAlpha === 1.0) { 
                this.ctx.save();
                this.ctx.fillStyle = `rgba(0, 0, 0, ${dimness})`;
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.restore();
             }
        }
        // --- Конец затемнения ---

        // --- End Radial Static Fog (Canvas Version) ---

        // --- Рисуем рамку подсветки Хищника --- 
        this.predatorHighlightColor = null; // Reset highlight color each frame
        if (predatorEntity && shouldHighlightPredator) {
            this.ctx.save();
            this.ctx.translate(cameraX, cameraY); // Применяем трансформации камеры
            this.ctx.scale(this.zoom, this.zoom);

            // Получаем цвет по ХП (копипаста из Player.render)
            const healthPercent = Math.max(0, Math.min(1, predatorEntity.currentHealth / predatorEntity.maxHealth));
            const fullHealthColor = { r: 78, g: 87, b: 40 };
            const zeroHealthColor = { r: 120, g: 0, b: 0 };
            const r = Math.round(fullHealthColor.r + (zeroHealthColor.r - fullHealthColor.r) * (1 - healthPercent));
            const g = Math.round(fullHealthColor.g + (zeroHealthColor.g - fullHealthColor.g) * (1 - healthPercent));
            const b = Math.round(fullHealthColor.b + (zeroHealthColor.b - fullHealthColor.b) * (1 - healthPercent));
            const borderColor = `rgb(${r}, ${g}, ${b})`; // <-- Reverted to rgb (100% opaque)
            this.predatorHighlightColor = borderColor; // <-- Store the calculated color

            // Рисуем рамку вокруг мировых координат Хищника
            const corners = predatorEntity.getCorners();
            if (corners && corners.length > 0) {
                this.ctx.strokeStyle = borderColor;
                // this.ctx.lineWidth = 3; // Толщина рамки
                this.ctx.lineWidth = 1; // <-- Set line width to 1px
                this.ctx.beginPath();
                this.ctx.moveTo(corners[0].x, corners[0].y);
                for (let i = 1; i < corners.length; i++) {
                    this.ctx.lineTo(corners[i].x, corners[i].y);
                }
                this.ctx.closePath();
                this.ctx.stroke();
            }
            this.ctx.restore();
        }
        // --- Конец рамки подсветки ---

        // --- Render UI (Player List, Timer, Crosshair, Fullscreen Button) --- 
        this.renderPlayerList(); // Список игроков справа

        // --- РИСУЕМ КУРСОР (замена renderCrosshair) ---
        if (this.player && input && input.rawMouseX !== undefined) {

            if (!this.player.isPredator) {
                // --- Курсор Охотника (круг) ---
                let cursorLineWidth = 1;
                let cursorStrokeStyle = '#ffffff';
                const crosshairRadius = this.currentCrosshairRadius; 
                const scaledRadius = crosshairRadius * this.zoom; // Учитываем зум для размера

                // Проверяем, целимся ли мы в видимого Хищника
                console.log(`Cursor Check: Aiming=${input.isRightMouseDown}, Predator Found=${!!predatorEntity}, ShouldHighlight=${shouldHighlightPredator}`); // DEBUG
                if (input.isRightMouseDown && predatorEntity && shouldHighlightPredator) { // Проверяем локальный флаг
                     cursorLineWidth = 2; // Увеличиваем толщину
                    // Рассчитываем цвет по ХП Хищника
                    // const healthPercent = Math.max(0, Math.min(1, predatorEntity.currentHealth / predatorEntity.maxHealth));
                    // const fullHealthColor = { r: 78, g: 87, b: 40 };
                    // const zeroHealthColor = { r: 120, g: 0, b: 0 };
                    // const r = Math.round(fullHealthColor.r + (zeroHealthColor.r - fullHealthColor.r) * (1 - healthPercent));
                    // const g = Math.round(fullHealthColor.g + (zeroHealthColor.g - fullHealthColor.g) * (1 - healthPercent));
                    // const b = Math.round(fullHealthColor.b + (zeroHealthColor.b - fullHealthColor.b) * (1 - healthPercent));
                    // cursorStrokeStyle = `rgb(${r}, ${g}, ${b})`; // Устанавливаем цвет <-- REPLACED
                    cursorStrokeStyle = this.predatorHighlightColor || '#ffffff'; // <-- Use stored highlight color
                }

                this.ctx.lineWidth = cursorLineWidth;
                this.ctx.strokeStyle = cursorStrokeStyle; 
                this.ctx.beginPath();
                // Рисуем в экранных координатах мыши
                this.ctx.arc(input.rawMouseX, input.rawMouseY, scaledRadius, 0, Math.PI * 2);
                this.ctx.stroke();
            } else {
                // --- Курсор Хищника (ПОЛОСКА) ---
                this.ctx.lineWidth = 3; // Толщина 3
                const currentAttackRange = this.predatorBaseAttackRange * this.predatorAttackCharge;
                const cursorWidthAngle = Math.PI / 8; // Угол, определяющий ширину полоски (22.5 градуса в каждую сторону)
                
                // Рассчитываем 2 точки для краев полоски в мировых координатах
                const angleLeft = this.player.angle - cursorWidthAngle / 2;
                const angleRight = this.player.angle + cursorWidthAngle / 2;
                
                const pointLeftXWorld = this.player.x + currentAttackRange * Math.cos(angleLeft);
                const pointLeftYWorld = this.player.y + currentAttackRange * Math.sin(angleLeft);
                const pointRightXWorld = this.player.x + currentAttackRange * Math.cos(angleRight);
                const pointRightYWorld = this.player.y + currentAttackRange * Math.sin(angleRight);

                // Переводим в экранные координаты
                // const cameraX = this.canvas.width / 2 - this.player.x * this.zoom; // Уже есть выше
                // const cameraY = this.canvas.height / 2 - this.player.y * this.zoom;
                const pointLeftXScreen = cameraX + pointLeftXWorld * this.zoom;
                const pointLeftYScreen = cameraY + pointLeftYWorld * this.zoom;
                const pointRightXScreen = cameraX + pointRightXWorld * this.zoom;
                const pointRightYScreen = cameraY + pointRightYWorld * this.zoom;
                
                this.ctx.strokeStyle = '#ffffff'; // Белый цвет
                this.ctx.beginPath();
                this.ctx.moveTo(pointLeftXScreen, pointLeftYScreen);
                this.ctx.lineTo(pointRightXScreen, pointRightYScreen);
                this.ctx.stroke();
            }
        }
        // --- КОНЕЦ РИСОВАНИЯ КУРСОРА ---

        // --- РИСУЕМ ВТОРОЙ КУРСОР ХИЩНИКА (КРУГ на месте мыши) --- 
        if (this.player && this.player.isPredator && input && input.rawMouseX !== undefined) {
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.arc(input.rawMouseX, input.rawMouseY, 5, 0, Math.PI * 2); // Диаметр 10 -> радиус 5
            this.ctx.stroke();
        }
        // --- КОНЕЦ ВТОРОГО КУРСОРА --- 

        // --- Обновление таймера дня/ночи --- 
        if (this.dayNightTimerElement) {
            const cycleDuration = this.dayNightCycleDuration;
            const cycleTime = this.currentCycleTime;
            const halfCycle = cycleDuration / 2;
            const quarterCycle = cycleDuration / 4;
            let timeRemainingInPhase;
            let phaseName;

            if (cycleTime < halfCycle) {
                // Ночь (0 до 1/2)
                timeRemainingInPhase = halfCycle - cycleTime; // Время до конца ночи
                phaseName = "Ночь";
            } else {
                // День (1/2 до 1)
                timeRemainingInPhase = cycleDuration - cycleTime; // Время до конца дня (и всего цикла)
                phaseName = "День";
            }
            
            // this.dayNightTimerElement.textContent = `${phaseName}: ${remainingSeconds}с | Туман: ${fogOpacityPercent}%`;
            this.dayNightTimerElement.textContent = `${phaseName} ${this.cycleCount}`;
        }

        // --- ОКОНЧАТЕЛЬНЫЙ Сброс флага подсветки --- 
        // if (predatorEntity) { // Больше не нужно, флаг локальный
        //     predatorEntity.forceTrueColor = false;
        // }
    }

    // Метод для отрисовки списка игроков (снова используется)
    renderPlayerList() {
        const padding = 10;
        const startX = this.canvas.width - padding;
        let startY = padding;
        const fontSize = 14;
        const lineHeight = fontSize * 1.3;

        this.ctx.save();
        this.ctx.font = `${fontSize}px Arial`;
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'top';

        // Получаем массив игроков из this.players и сортируем (опционально)
        const playerList = Object.values(this.players);
        // playerList.sort((a, b) => a.name.localeCompare(b.name));

        playerList.forEach(player => {
            const name = player.name || `Player ${player.id}`; // Запасной вариант имени
            const isDead = player.health <= 0;
            
            this.ctx.fillStyle = isDead ? 'red' : 'white';
            this.shadowBlur = 1; // Исправлено с this.shadowBlur

            let displayName = name;
            if (player.id === this.myPlayerId) {
                displayName = `> ${name} <`; // Выделяем себя
            }

            this.ctx.fillText(displayName, startX, startY);

            // Добавляем зачеркивание для мертвых
            if (isDead) {
                const textWidth = this.ctx.measureText(displayName).width;
                this.ctx.strokeStyle = 'red';
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.moveTo(startX - textWidth, startY + fontSize / 2);
                this.ctx.lineTo(startX, startY + fontSize / 2);
                this.ctx.stroke();
            }

            startY += lineHeight; // Сдвигаем Y для следующего имени
        });

        this.ctx.restore();
    }

    // Общая функция для обработки смерти или отключения
    handleDisconnectionOrDeath(reasonMessage = "Игра окончена") {
        // console.log(`Handling disconnection or death: ${reasonMessage}`);

        // 1. Остановить игровой цикл
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        // 2. Отключиться от сервера (если еще подключены)
        if (this.socket && this.socket.connected) {
            this.socket.disconnect();
        }
        this.socket = null;

        // 3. Сбросить состояние игры
        this.myPlayerId = null;
        this.myName = "";
        this.player = null;
        this.players = {};
        this.playerEntities = {};
        this.bulletEntities = {};
        this.bonusEntities = {}; // <-- Сбрасываем бонусы
        this.gameEngine.clearAllEntities(); // Очищаем движок

        // 4. Показать UI входа, скрыть канвас
        const joinUi = document.getElementById('join-ui');
        const gameCanvas = document.getElementById('gameCanvas');
        const nameInput = document.getElementById('playerNameInput');
        const joinButton = document.getElementById('joinButton');
        const joinError = document.getElementById('joinError');

        if (joinUi) joinUi.style.display = 'block';
        if (gameCanvas) gameCanvas.style.display = 'none';

        // 5. Разблокировать UI входа и показать причину
        if (nameInput) nameInput.disabled = false;
        if (joinButton) {
             joinButton.disabled = false;
             joinButton.textContent = 'Присоединиться';
        }
        if (joinError) {
            joinError.textContent = reasonMessage;
            joinError.style.display = 'block';
        }
        if (nameInput) nameInput.focus(); // Фокус на ввод имени
    }
}

// --- Start the game (теперь по кнопке) ---
document.addEventListener('DOMContentLoaded', () => {
    const joinUi = document.getElementById('join-ui');
    const nameInput = document.getElementById('playerNameInput');
    const joinButton = document.getElementById('joinButton');
    const joinError = document.getElementById('joinError');
    const gameCanvas = document.getElementById('gameCanvas');

    if (!joinUi || !nameInput || !joinButton || !joinError || !gameCanvas) {
        console.error("Required UI elements not found!"); // <-- ОСТАВЛЯЕМ
        return;
    }

    // Фокус на поле ввода имени
    nameInput.focus();

    // Обработчик нажатия Enter в поле имени
    nameInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            joinButton.click(); // Имитируем клик по кнопке
        }
    });

    joinButton.addEventListener('click', () => {
        const playerName = nameInput.value.trim();
        joinError.style.display = 'none'; // Скрываем прошлые ошибки

        if (!playerName) {
            joinError.textContent = 'Пожалуйста, введите имя.';
            joinError.style.display = 'block';
            nameInput.focus();
            return;
        }

        // Блокируем кнопку и поле ввода на время подключения
        nameInput.disabled = true;
        joinButton.disabled = true;
        joinButton.textContent = 'Подключение...';

        // Создаем и запускаем игру
        const game = new Game();
        game.connectAndJoin(playerName);
        
        // Можно добавить таймер или проверку в слушателе 'disconnect' в Game
        // пока просто разблокируем, если что-то пошло не так через 5 секунд
        setTimeout(() => {
            if (!game.socket || !game.myPlayerId) { // Если не подключились успешно
                 nameInput.disabled = false;
                 joinButton.disabled = false;
                 joinButton.textContent = 'Присоединиться';
                 // Ошибку покажет обработчик 'init' или 'joinError'
            }
        }, 5000); 
    });

    // --- Обработчик кнопки Fullscreen --- 
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`); // <-- ОСТАВЛЯЕМ
                });
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        });
    }
}); 

// Вызываем инициализацию правил при загрузке скрипта
initializeRulesDisplay(); 