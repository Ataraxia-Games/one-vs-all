import { checkCircleWallCollision } from '../utils/collision.js';
import { Bullet } from './Bullet.js';
import { SpeedCircle } from './SpeedCircle.js'; // Импортируем эффект

export class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 15; 
        this.speed = 200; // Увеличена скорость (пикселей В СЕКУНДУ)
        this.angle = 0;
        this.width = 30; // Keep for potential future use or rendering reference
        this.height = 30;
        this.ammo = 10; // Начальное количество патронов

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

        // Генерируем круги локально при намерении двигаться со спринтом
        if (input.isShiftDown && (input.keys.w || input.keys.a || input.keys.s || input.keys.d)) {
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

    render(ctx, isSelf = false) {
        console.log(`[Player Render] ID: ${this.id}, isSelf: ${isSelf}, isPredator: ${this.isPredator}`); // <-- ОТЛАДКА В НАЧАЛЕ

        let originalColor = this.color; 
        let renderColor = originalColor; // Используем эту переменную для отрисовки

        if (isSelf && this.isPredator) {
            // Рассчитать цвет от зеленого к красному на основе здоровья
            const healthPercent = Math.max(0, Math.min(1, this.currentHealth / this.maxHealth));
            // Плавный переход от зеленого (0, 255, 0) к желтому (255, 255, 0) к красному (255, 0, 0)
            let r, g, b = 0;
            if (healthPercent > 0.5) {
                // От зеленого к желтому (health 1.0 -> 0.5)
                r = Math.round(255 * 2 * (1 - healthPercent));
                g = 255;
            } else {
                // От желтого к красному (health 0.5 -> 0.0)
                r = 255;
                g = Math.round(255 * 2 * healthPercent);
            }
            renderColor = `rgb(${r}, ${g}, ${b})`; // Присваиваем цвет для рендера СЮДА
            console.log(`[Self Predator Render] HP: ${this.currentHealth}/${this.maxHealth} (${healthPercent.toFixed(2)}%), Calculated Color: ${renderColor}`); // ОТЛАДКА
        }

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

        // Отрисовка имени игрока (только если не сам игрок и не Хищник)
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
         
        this.color = originalColor; // Восстанавливаем оригинальный цвет
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