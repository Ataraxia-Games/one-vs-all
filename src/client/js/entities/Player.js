import { checkCircleWallCollision } from '../utils/collision.js';
import { Bullet } from './Bullet.js';
import { SpeedCircle } from './SpeedCircle.js'; // Импортируем эффект

export class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
        this.angle = 0; // Угол направления (в радианах)
        this.targetAngle = 0;
        this.size = 30; // Размер игрока (диаметр круга или сторона квадрата)
        this.radius = this.size / 2;
        this.color = '#000000'; // Черный по умолчанию
        this.speed = 200; // Пикселей в секунду
        this.rotationSpeed = Math.PI * 1.5; // Радианов в секунду
        this.maxHealth = 100;
        this.currentHealth = 100;
        this.name = ""; // Имя игрока
        this.isPredator = false; // Флаг Хищника
        this.isAiming = false; // Флаг прицеливания (для FOV)
        this.ammo = 10; // Начальное количество патронов
        this.maxAmmo = 10; // Максимальное количество патронов
        this.id = null; // ID игрока с сервера

        // Параметры дробовика
        this.shotgunPellets = 8;
        this.shotgunSpread = Math.PI / 18; // Угол разброса (10 градусов)
        this.bulletSpeed = 600;
        this.bulletLifetime = 500; // ms

        // Speed circle properties
        this.speedCircleCooldown = 200; // ms между кругами
        this.lastSpeedCircleTime = -Infinity;

        // Health properties
        this.maxHealth = 100;
        this.currentHealth = this.maxHealth; // Начинаем со 100% здоровья
        this.id = null; // Будет установлен из Game
        this.color = '#000'; // Черный цвет по умолчанию (сервер может прислать другой)
        this.isPredator = false; // Добавляем флаг по умолчанию
        this.name = ""; // Добавляем имя по умолчанию
    }

    update(deltaTime, input, walls) {
        // Обновляем только угол для отзывчивости прицеливания
        if (input.mouse && input.mouse.x !== undefined && input.mouse.y !== undefined) {
            const aimDx = input.mouse.x - this.x;
            const aimDy = input.mouse.y - this.y;
            // Угол обновляется локально и отправляется на сервер
            this.angle = Math.atan2(aimDy, aimDx);
        }

        // Генерируем круги локально при нажатии Shift
        if (input.isShiftDown) { // Убираем проверку на движение (input.keys...)
             this.tryGenerateSpeedCircle();
         }
        
        // Движение и столкновения теперь обрабатываются сервером
    }

    // Метод для создания пуль - БОЛЬШЕ НЕ НУЖЕН НА КЛИЕНТЕ
    /* 
    shoot() {
        if (this.ammo <= 0) {
            console.log("Out of ammo!");
            return []; // Возвращаем пустой массив, если нет патронов
        }

        this.ammo--; // Уменьшаем патроны
        console.log("Ammo left:", this.ammo);

        const bullets = [];
        for (let i = 0; i < this.shotgunPellets; i++) {
            // Добавляем случайный разброс к углу
            const spreadAngle = this.angle + (Math.random() - 0.5) * this.shotgunSpread;
            
            // Создаем пулю чуть впереди игрока, чтобы она не столкнулась с ним сразу
            const startX = this.x + Math.cos(this.angle) * (this.radius + 5); 
            const startY = this.y + Math.sin(this.angle) * (this.radius + 5);

            bullets.push(
                new Bullet(startX, startY, spreadAngle, this.bulletSpeed, this.bulletLifetime)
            );
        }
        return bullets; // Возвращаем массив созданных пуль
    }
    */

    // Новый метод для расчета углов квадрата (для Хищника)
    getCorners() {
        const halfSize = this.radius; // Используем радиус как половину стороны
        const cosAngle = Math.cos(this.angle);
        const sinAngle = Math.sin(this.angle);

        // Векторы к углам от центра (повернутые вектора полудиагоналей)
        const cornerVecX1 = (halfSize * cosAngle - halfSize * sinAngle); // x для Угла 1 (например, верхний правый)
        const cornerVecY1 = (halfSize * sinAngle + halfSize * cosAngle); // y для Угла 1
        const cornerVecX2 = (-halfSize * cosAngle - halfSize * sinAngle); // x для Угла 2 (верхний левый)
        const cornerVecY2 = (-halfSize * sinAngle + halfSize * cosAngle); // y для Угла 2

        // Возвращаем массив углов в мировых координатах
        return [
            { x: this.x + cornerVecX1, y: this.y + cornerVecY1 }, // Угол 1
            { x: this.x + cornerVecX2, y: this.y + cornerVecY2 }, // Угол 2
            { x: this.x - cornerVecX1, y: this.y - cornerVecY1 }, // Угол 3 (противоп. Углу 1)
            { x: this.x - cornerVecX2, y: this.y - cornerVecY2 }  // Угол 4 (противоп. Углу 2)
        ];
    }

    render(ctx, isSelf = false, isViewerPredator = false) {
        // console.log(`[Player Render] ID: ${this.id}, isSelf: ${isSelf}, isPredator: ${this.isPredator}, isViewerPredator: ${isViewerPredator}`);

        let originalColor = this.color; 
        let renderColor = originalColor; 

        if (isViewerPredator && !isSelf && !this.isPredator) {
             // Хищник смотрит на Охотника -> серый цвет
             renderColor = 'rgb(128, 128, 128)';
        } else if (isSelf && this.isPredator) {
            // Хищник смотрит на себя -> цвет по здоровью
            const healthPercent = Math.max(0, Math.min(1, this.currentHealth / this.maxHealth));
            // Логика цвета КАК У ФОНА ОХОТНИКА 
            const fullHealthColor = { r: 78, g: 87, b: 40 }; 
            const zeroHealthColor = { r: 120, g: 0, b: 0 }; 
            const r = Math.round(fullHealthColor.r + (zeroHealthColor.r - fullHealthColor.r) * (1 - healthPercent));
            const g = Math.round(fullHealthColor.g + (zeroHealthColor.g - fullHealthColor.g) * (1 - healthPercent));
            const b = Math.round(fullHealthColor.b + (zeroHealthColor.b - fullHealthColor.b) * (1 - healthPercent));
            renderColor = `rgb(${r}, ${g}, ${b})`; 
            // console.log(`[Self Predator Render] HP: ${this.currentHealth}/${this.maxHealth} (${healthPercent.toFixed(2)}%), Calculated Color: ${renderColor}`); 
        } 
        // Иначе renderColor остается originalColor

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        if (this.isPredator) {
            // Рисуем квадрат Хищника
            const size = this.radius * 2; // Полный размер стороны
            ctx.fillStyle = renderColor; // Используем renderColor
            // Рисуем квадрат с центром в (0, 0) повернутого контекста
            ctx.fillRect(-size / 2, -size / 2, size, size);
            // ctx.strokeStyle = 'red'; // Для отладки можно обвести
            // ctx.strokeRect(-size / 2, -size / 2, size, size);
        } else {
            // Рисуем круг Охотника (как раньше)
            ctx.fillStyle = renderColor; // Используем renderColor
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2); 
            ctx.fill();
        }

        // Отрисовка треугольника направления (УДАЛЕНО)
        /*
        if (!this.isPredator) {
            ctx.beginPath();
            ctx.moveTo(this.radius, 0);
            ctx.lineTo(this.radius - 6, -4); // Точки относительно центра
            ctx.lineTo(this.radius - 6, 4);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'; // Белый полупрозрачный
            ctx.fill();
        }
        */

        // Отрисовка полоски здоровья (над игроком) (УДАЛЕНО)
        /*
        if (!this.isPredator) {
            const healthBarWidth = this.radius * 0.8;
            const healthBarHeight = 4;
            const healthBarX = -healthBarWidth / 2;
            const healthBarY = -this.radius / 2 - healthBarHeight - 2; // Над квадратом
            const currentHealthWidth = healthBarWidth * (this.currentHealth / this.maxHealth);

            // Фон полоски (темно-серый)
            ctx.fillStyle = '#555';
            ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
            // Текущее здоровье (зеленый)
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(healthBarX, healthBarY, currentHealthWidth, healthBarHeight);
        }
        */

        ctx.restore();

        // Отрисовка имени игрока (ПЕРЕНЕСЕНО В Game.render)
        /*
        if (!isSelf && this.name && !this.isPredator) {
             ctx.save();
             ctx.font = '12px Arial';
             ctx.fillStyle = 'white';
             ctx.textAlign = 'center';
             ctx.textBaseline = 'bottom';
             ctx.shadowColor = 'black';
             ctx.shadowBlur = 2;
             ctx.fillText(this.name, this.x, this.y - this.radius / 2 - 10); // Над полоской здоровья
             ctx.restore();
         }
         */
         
        // this.color = originalColor; // Восстанавливаем оригинальный цвет - БОЛЬШЕ НЕ НУЖНО?
        // Оставляем пока что, т.к. this.color мог меняться не только для isSelf
        this.color = originalColor; 
    }

    tryGenerateSpeedCircle() {
        const now = performance.now();
        if (now - this.lastSpeedCircleTime > this.speedCircleCooldown) {
            this.lastSpeedCircleTime = now;
            // Сигнализируем игре о необходимости создать круг
            // Game class будет отвечать за создание и добавление эффекта
            if (this.onSpeedCircle) { // Проверяем, есть ли обработчик
                 this.onSpeedCircle(this.x, this.y);
            }
        }
    }

    takeDamage(amount) {
        this.currentHealth -= amount;
        this.currentHealth = Math.max(0, this.currentHealth); // Не уходим в минус
        console.log(`Player ${this.id} took ${amount} damage, health: ${this.currentHealth}/${this.maxHealth}`);
        // TODO: Добавить эффект получения урона (например, мигание фона)
    }
} 