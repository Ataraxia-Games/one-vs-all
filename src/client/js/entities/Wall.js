export class Wall {
    constructor(x, y, length, angle) {
        this.x = x;
        this.y = y;
        this.length = length;
        this.angle = angle;
        this.width = 20; // Толщина стены
    }

    update(deltaTime, input) {
        // Стены статичны, поэтому update пустой
    }

    render(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Рисуем стену
        ctx.fillStyle = '#333';
        ctx.fillRect(-this.width/2, -this.length/2, this.width, this.length);

        ctx.restore();
    }
} 