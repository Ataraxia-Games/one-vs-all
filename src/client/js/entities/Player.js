import { checkCircleWallCollision } from '../utils/collision.js';
import { Bullet } from './Bullet.js';

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

    // Метод для создания пуль
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

    render(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        // Вращаем для рендеринга (если нужно, но для круга не обязательно)
        // ctx.rotate(this.angle); 

        // Draw player body using this.color
        ctx.fillStyle = this.color; // Используем цвет игрока
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2); 
        ctx.fill();

        // Draw Ammo Count (если это наш игрок)
        if (this.isSelf) { // Добавим флаг isSelf? Или проверять по ID
            // ctx.rotate(-this.angle); // Нужно ли вращать назад? Текст уже не внутри
            ctx.fillStyle = 'rgba(255, 255, 255, 0.71)'; 
            ctx.font = 'bold 17px Arial'; 
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.ammo, 0, this.radius + 15); // Рисуем под кругом
        }

        ctx.restore();
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