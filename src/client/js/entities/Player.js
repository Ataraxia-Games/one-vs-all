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
    }

    update(deltaTime, input, walls) {
        // Convert deltaTime from ms to seconds for consistent speed calculation
        const dt = deltaTime / 1000; 

        // Determine current speed based on Shift key
        const currentSpeed = input.isShiftDown ? this.speed * 1.5 : this.speed; // Ускорение в 1.75 раза

        // Calculate potential movement scaled by time and speed
        let deltaX = 0;
        let deltaY = 0;
        if (input.keys.w) deltaY -= currentSpeed * dt;
        if (input.keys.s) deltaY += currentSpeed * dt;
        if (input.keys.a) deltaX -= currentSpeed * dt;
        if (input.keys.d) deltaX += currentSpeed * dt;

        // Normalize diagonal movement (optional but good practice)
        if (deltaX !== 0 && deltaY !== 0) {
            const factor = 1 / Math.sqrt(2);
            deltaX *= factor;
            deltaY *= factor;
        }

        // --- Collision Detection & Resolution (Move then Pushback) ---
        let tempX = this.x + deltaX;
        let tempY = this.y + deltaY;

        if (walls) {
            // Check for collisions at the temporary position
            // Perform multiple iterations to handle pushing from multiple walls if needed
            const maxPushIterations = 3; 
            for (let i = 0; i < maxPushIterations; i++) {
                let collisionOccurred = false;
                for (const wall of walls) {
                    const collisionResult = checkCircleWallCollision(
                        { x: tempX, y: tempY, radius: this.radius }, 
                        wall
                    );

                    if (collisionResult.collided) {
                        collisionOccurred = true;
                        // Apply pushback based on overlap and push direction
                        // Add a small epsilon to avoid getting stuck exactly on the edge
                        const pushAmount = collisionResult.overlap + 0.01;
                        tempX += collisionResult.pushX * pushAmount;
                        tempY += collisionResult.pushY * pushAmount;
                        // Note: This handles one wall per iteration. 
                        // Multiple iterations help resolve complex corner cases.
                    }
                }
                if (!collisionOccurred) {
                    // If no collision in this iteration, position is resolved
                    break; 
                }
            }
        }

        // Set final position after potential pushbacks
        this.x = tempX;
        this.y = tempY;
        // --- End Collision ---

        // --- DEBUG LOG --- 
        console.log(`Shift: ${input.isShiftDown}, dX: ${deltaX.toFixed(2)}, dY: ${deltaY.toFixed(2)}`);
        // --- END DEBUG LOG ---

        // --- Generate Speed Circles if sprinting ---
        if (input.isShiftDown && (deltaX !== 0 || deltaY !== 0)) {
            this.tryGenerateSpeedCircle();
        }

        // Handle rotation (aiming) - relative to current position
        if (input.mouse.x !== undefined && input.mouse.y !== undefined) {
            const aimDx = input.mouse.x - this.x;
            const aimDy = input.mouse.y - this.y;
            this.angle = Math.atan2(aimDy, aimDx);
        }
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
        ctx.rotate(this.angle);

        // Draw player body as a black circle
        ctx.fillStyle = '#000'; // Черный цвет
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2); 
        ctx.fill();

        // --- Remove aiming line --- 
        /*
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(this.radius, 0); 
        ctx.strokeStyle = '#f00';
        ctx.lineWidth = 2; 
        ctx.stroke();
        */

        // --- Draw Ammo Count --- 
        // Rotate context back to draw text upright relative to screen
        ctx.rotate(-this.angle); 
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.71)'; // Полупрозрачный белый цвет текста
        ctx.font = 'bold 17px Arial'; // Увеличен размер шрифта (было 10px)
        ctx.textAlign = 'center'; // Выравнивание по центру
        ctx.textBaseline = 'middle'; // Выравнивание по вертикали
        ctx.fillText(this.ammo, 0, 0); // Рисуем текст в центре (0, 0) локальных координат

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
} 