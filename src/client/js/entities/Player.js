import { checkCircleWallCollision } from '../utils/collision.js';

export class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 30;
        this.radius = 15;
        this.speed = 5;
        this.angle = 0;
    }

    update(deltaTime, input, walls) {
        // Calculate potential movement
        let deltaX = 0;
        let deltaY = 0;
        // Note: Using fixed speed for now, not scaling by deltaTime for simplicity
        if (input.keys.w) deltaY -= this.speed; 
        if (input.keys.s) deltaY += this.speed;
        if (input.keys.a) deltaX -= this.speed;
        if (input.keys.d) deltaX += this.speed;

        // --- Collision Detection & Resolution with Sliding ---
        let finalX = this.x;
        let finalY = this.y;

        if (walls) {
            // Check X-axis collision
            let potentialX = this.x + deltaX;
            let collisionX = false;
            if (deltaX !== 0) {
                for (const wall of walls) {
                    if (checkCircleWallCollision({ x: potentialX, y: this.y, radius: this.radius }, wall)) {
                        collisionX = true;
                        // TODO: Optional - adjust potentialX to stop exactly at the wall
                        break;
                    }
                }
            }
            if (!collisionX) {
                finalX = potentialX;
            }

            // Check Y-axis collision (using potentially updated X: finalX)
            let potentialY = this.y + deltaY;
            let collisionY = false;
            if (deltaY !== 0) {
                for (const wall of walls) {
                    // Check Y movement against the position *after* potential X movement
                    if (checkCircleWallCollision({ x: finalX, y: potentialY, radius: this.radius }, wall)) {
                        collisionY = true;
                        // TODO: Optional - adjust potentialY to stop exactly at the wall
                        break;
                    }
                }
            }
            if (!collisionY) {
                finalY = potentialY;
            }
        } else {
             // No walls provided, move freely
            finalX = this.x + deltaX;
            finalY = this.y + deltaY;
        }

        // Apply final position
        this.x = finalX;
        this.y = finalY;
        // --- End Collision ---

        // Handle rotation (aiming) - relative to current position
        if (input.mouse.x !== undefined && input.mouse.y !== undefined) {
            const aimDx = input.mouse.x - this.x;
            const aimDy = input.mouse.y - this.y;
            this.angle = Math.atan2(aimDy, aimDx);
        }
    }

    render(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Draw player body as a circle
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2); // Draw circle using collision radius
        ctx.fill();

        // Draw aiming direction line from the center
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(this.radius, 0); // Make line length match radius
        ctx.strokeStyle = '#f00';
        ctx.lineWidth = 2; // Make line slightly thicker
        ctx.stroke();

        ctx.restore();
    }
} 