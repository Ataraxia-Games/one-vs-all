export class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 30;
        this.speed = 5;
        this.angle = 0;
    }

    update(deltaTime, input) {
        // Handle movement
        if (input.keys.w) this.y -= this.speed;
        if (input.keys.s) this.y += this.speed;
        if (input.keys.a) this.x -= this.speed;
        if (input.keys.d) this.x += this.speed;

        // Handle rotation (aiming)
        if (input.mouse.x !== undefined && input.mouse.y !== undefined) {
            const dx = input.mouse.x - this.x;
            const dy = input.mouse.y - this.y;
            this.angle = Math.atan2(dy, dx);
        }
    }

    render(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Draw player body
        ctx.fillStyle = '#fff';
        ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);

        // Draw aiming direction
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(this.width, 0);
        ctx.strokeStyle = '#f00';
        ctx.stroke();

        ctx.restore();
    }
} 