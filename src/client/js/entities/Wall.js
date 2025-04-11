export class Wall {
    constructor(x, y, length, angle, color = '#333') {
        this.x = x;
        this.y = y;
        this.length = length;
        this.angle = angle;
        this.width = 20; // Толщина стены
        this.color = color; // Добавляем цвет
    }

    update(deltaTime, input) {
        // Стены статичны, поэтому update пустой
    }

    render(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y); // Переходим в центр стены
        ctx.rotate(this.angle);      // Поворачиваем систему координат

        // Рисуем стену, центрированную локально (вдоль повернутой оси X)
        ctx.fillStyle = this.color; 
        // x: -длина/2, y: -ширина(толщина)/2, ширина: длина, высота: ширина(толщина)
        ctx.fillRect(-this.length / 2, -this.width / 2, this.length, this.width);

        ctx.restore();
    }
} 