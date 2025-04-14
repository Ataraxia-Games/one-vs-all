export class Wall {
    constructor(x, y, length, angle, color = '#000000') {
        this.x = x;
        this.y = y;
        this.length = length;
        this.angle = angle;
        this.width = 20; // Толщина стены
        this.color = color; // Добавляем цвет
        this.calculateEndpoints(); // Вычисляем точки при создании
        this.calculateCorners();   // Calculate corners
    }

    calculateEndpoints() {
        const halfLength = this.length / 2;
        const cosAngle = Math.cos(this.angle);
        const sinAngle = Math.sin(this.angle);

        // Смещение от центра к концам вдоль направления стены
        const offsetX = halfLength * cosAngle;
        const offsetY = halfLength * sinAngle;

        // Конечные точки в мировых координатах
        this.x1 = this.x + offsetX;
        this.y1 = this.y + offsetY;
        this.x2 = this.x - offsetX;
        this.y2 = this.y - offsetY;
    }

    calculateCorners() {
        const halfLength = this.length / 2;
        const halfWidth = this.width / 2;
        const cosAngle = Math.cos(this.angle);
        const sinAngle = Math.sin(this.angle);

        // Calculate vectors for half-length and half-width directions
        const lengthVecX = halfLength * cosAngle;
        const lengthVecY = halfLength * sinAngle;
        const widthVecX = halfWidth * -sinAngle; // Perpendicular to angle
        const widthVecY = halfWidth * cosAngle;  // Perpendicular to angle

        // Calculate corner points relative to the center (this.x, this.y)
        this.corners = [
            { // Top-Right corner (relative to wall orientation)
                x: this.x + lengthVecX + widthVecX,
                y: this.y + lengthVecY + widthVecY
            },
            { // Bottom-Right corner
                x: this.x + lengthVecX - widthVecX,
                y: this.y + lengthVecY - widthVecY
            },
            { // Bottom-Left corner
                x: this.x - lengthVecX - widthVecX,
                y: this.y - lengthVecY - widthVecY
            },
            { // Top-Left corner
                x: this.x - lengthVecX + widthVecX,
                y: this.y - lengthVecY + widthVecY
            }
        ];
    }

    update(deltaTime, input) {
        // Стены статичны, поэтому update пустой
    }

    render(ctx, isPredatorView = false) {
        ctx.save();
        ctx.translate(this.x, this.y); // Переходим в центр стены
        ctx.rotate(this.angle);      // Поворачиваем систему координат

        const renderColor = isPredatorView ? 'rgb(128, 128, 128)' : this.color;

        ctx.fillStyle = renderColor; // Используем выбранный цвет
        // x: -длина/2, y: -ширина(толщина)/2, ширина: длина, высота: ширина(толщина)
        ctx.fillRect(-this.length / 2, -this.width / 2, this.length, this.width);

        ctx.restore();
    }

    getCorners() {
        return this.corners;
    }
} 