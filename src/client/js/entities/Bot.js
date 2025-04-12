import { checkCircleWallCollision } from '../utils/collision.js';
import { Bullet } from './Bullet.js';

export class Bot {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 15; 
        this.speed = 150; // Чуть медленнее игрока
        this.angle = Math.random() * Math.PI * 2; // Случайное начальное направление
        this.ammo = 20; // Больше патронов для простоты
        this.color = '#000000'; // Черный цвет (как у игрока)

        // Параметры стрельбы (можно сделать отличными от игрока)
        this.shotgunPellets = 6;
        this.shotgunSpread = Math.PI / 15; 
        this.bulletSpeed = 500;
        this.bulletLifetime = 600; 
        this.shootCooldown = 1000; // ms между выстрелами
        this.lastShotTime = -Infinity;

        // ИИ Таймеры и состояния
        this.decisionTimer = 0;
        this.decisionInterval = 500 + Math.random() * 500; // Решения чаще (0.5-1 сек)
        this.moveDirection = { x: 0, y: 0 };
        this.isShooting = false;
        this.targetPlayer = null; // Храним цель
        this.attackRange = 400; // Дистанция атаки
        this.sightRange = 600; // Дистанция обнаружения

        // Спринт
        this.isSprinting = false;
        this.sprintSpeedMultiplier = 1.6; // Множитель скорости спринта
        this.speedCircleCooldown = 250; // ms между кругами (чуть реже игрока)
        this.lastSpeedCircleTime = -Infinity;
        // this.onSpeedCircle будет присвоен в Game.initGame
    }

    // Логика принятия решений ИИ
    makeDecision() {
        if (!this.targetPlayer) { 
            // Случайное блуждание
            const randomAngle = Math.random() * Math.PI * 2;
            this.moveDirection.x = Math.cos(randomAngle);
            this.moveDirection.y = Math.sin(randomAngle);
            this.isShooting = false;
            this.isSprinting = Math.random() < 0.1; // 10% шанс спринта при блуждании
            this.angle = randomAngle; 
            return; 
        }

        // Логика при наличии цели
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const distSq = dx * dx + dy * dy;
        const targetAngle = Math.atan2(dy, dx);
        this.angle = targetAngle; 

        // Преследуем со спринтом, если далеко
        if (distSq > this.attackRange * this.attackRange) { // Двигаемся, если дальше attackRange
            const dist = Math.sqrt(distSq);
            this.moveDirection.x = dx / dist;
            this.moveDirection.y = dy / dist;
            this.isShooting = false; 
            this.isSprinting = true; // Всегда спринтуем при преследовании
        } else if (distSq > (this.attackRange * 0.5) * (this.attackRange * 0.5)){
            // Двигаемся медленно и стреляем, если близко, но не в упор
            const dist = Math.sqrt(distSq);
            this.moveDirection.x = dx / dist;
            this.moveDirection.y = dy / dist;
            this.isShooting = true; 
            this.isSprinting = false;
        } else {
             // Стоим и стреляем, если совсем близко
            this.moveDirection.x = 0;
            this.moveDirection.y = 0;
            this.isShooting = true;
            this.isSprinting = false;
        }
    }

    update(deltaTime, walls, gameApi, player) { 
        const dt = deltaTime / 1000; 

        // Обновляем цель
        if (player) {
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const distSq = dx * dx + dy * dy;
            // Если игрок в радиусе видимости, делаем его целью
            // Если был целью, но ушел далеко, теряем цель
            if (distSq < this.sightRange * this.sightRange) {
                this.targetPlayer = player;
            } else {
                this.targetPlayer = null;
                this.isShooting = false; // Перестаем стрелять, если потеряли цель
            }
        } else {
            this.targetPlayer = null; // Игрок не передан
            this.isShooting = false;
        }

        // Обновляем таймер принятия решений
        this.decisionTimer += deltaTime;
        if (this.decisionTimer >= this.decisionInterval) {
            this.decisionTimer = 0;
            this.makeDecision();
            this.decisionInterval = 500 + Math.random() * 500; // Новая случайная задержка
        }

        // Движение
        const currentSpeed = this.isSprinting ? this.speed * this.sprintSpeedMultiplier : this.speed;
        let deltaX = this.moveDirection.x * currentSpeed * dt;
        let deltaY = this.moveDirection.y * currentSpeed * dt;

        // --- Столкновения со стенами (аналогично Player) ---
        let tempX = this.x + deltaX;
        let tempY = this.y + deltaY;
        if (walls) {
            const maxPushIterations = 3;
            for (let i = 0; i < maxPushIterations; i++) {
                let collisionOccurred = false;
                for (const wall of walls) {
                    const collisionResult = checkCircleWallCollision({ x: tempX, y: tempY, radius: this.radius }, wall);
                    if (collisionResult.collided) {
                        collisionOccurred = true;
                        const pushAmount = collisionResult.overlap + 0.01;
                        tempX += collisionResult.pushX * pushAmount;
                        tempY += collisionResult.pushY * pushAmount;
                    }
                }
                if (!collisionOccurred) break;
            }
        }
        this.x = tempX;
        this.y = tempY;
        // --- Конец столкновений ---

        // --- Генерация кругов скорости ---
        if (this.isSprinting && (deltaX !== 0 || deltaY !== 0)) {
            // console.log("Bot trying to generate speed circle..."); // DEBUG
            this.tryGenerateSpeedCircle();
        }

        // --- Стрельба --- 
        const now = performance.now();
        // Стреляем только если есть цель и флаг isShooting
        if (this.targetPlayer && this.isShooting && now - this.lastShotTime > this.shootCooldown) {
            const newBullets = this.shoot();
            if (newBullets.length > 0 && gameApi && gameApi.addBullet) {
                newBullets.forEach(bullet => gameApi.addBullet(bullet));
                this.lastShotTime = now;
            }
            // Не сбрасываем isShooting здесь, позволяем makeDecision решать
        }
    }

    // Метод стрельбы (аналогичен Player.shoot)
    shoot() {
        if (this.ammo <= 0) {
            return []; 
        }
        this.ammo--; 
        const bullets = [];
        for (let i = 0; i < this.shotgunPellets; i++) {
            const spreadAngle = this.angle + (Math.random() - 0.5) * this.shotgunSpread;
            const startX = this.x + Math.cos(this.angle) * (this.radius + 5); 
            const startY = this.y + Math.sin(this.angle) * (this.radius + 5);
            bullets.push(new Bullet(startX, startY, spreadAngle, this.bulletSpeed, this.bulletLifetime));
        }
        return bullets;
    }

    // --- Метод для генерации кругов (аналогичен Player) ---
    tryGenerateSpeedCircle() {
        const now = performance.now();
        if (now - this.lastSpeedCircleTime > this.speedCircleCooldown) {
            this.lastSpeedCircleTime = now;
            if (this.onSpeedCircle) { 
                 this.onSpeedCircle(this.x, this.y);
            }
        }
    }

    render(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        // Не вращаем самого бота
        // ctx.rotate(this.angle); 

        // Рисуем тело бота
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // --- Убрана отрисовка счетчика патронов ---
        /*
        ctx.fillStyle = '#fff'; 
        ctx.font = 'bold 16px Arial'; 
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.ammo, 0, 0);
        */

        ctx.restore();
    }
} 