import { checkCircleWallCollision } from '../utils/collision.js';

export class Bullet {
    constructor(x, y, angle, speed, lifetime, radius = 2, color = '#ffcc00') {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = speed;
        this.lifetime = lifetime; // ms
        this.radius = radius;
        this.color = color;

        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.timeAlive = 0;
        this.isActive = true; // Флаг активности пули
    }

    update(deltaTime, walls) {
        if (!this.isActive) return;

        const dt = deltaTime / 1000;
        const moveX = this.vx * dt;
        const moveY = this.vy * dt;
        const nextX = this.x + moveX;
        const nextY = this.y + moveY;

        this.timeAlive += deltaTime;
        if (this.timeAlive > this.lifetime) {
            this.isActive = false;
            return;
        }

        // Проверка столкновения со стенами
        if (walls) {
            for (const wall of walls) {
                 // Проверяем столкновение в *конечной* точке
                 // Простая проверка: если точка внутри стены, деактивируем
                 // TODO: Можно улучшить до проверки пересечения отрезка движения со стеной
                if (checkCircleWallCollision({ x: nextX, y: nextY, radius: this.radius }, wall).collided) {
                    this.isActive = false;
                    return; // Останавливаем обновление и движение
                }
            }
        }

        // Обновляем позицию, если нет столкновения
        this.x = nextX;
        this.y = nextY;
    }

    render(ctx) {
        if (!this.isActive) return;

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
} 