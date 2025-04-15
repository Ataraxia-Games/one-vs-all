export class Bonus {
    constructor(id, x, y) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.size = 30; // Размер как у квадрата Хищника
        this.radius = this.size / 2;

        // Состояние сбора
        this.isCollecting = false;
        this.collectionProgress = 0;
        this.collectionDuration = 2000; // 2 секунды в мс
    }

    update(deltaTime) {
        // Логика обновления прогресса, если нужно (пока управляется из Game.js)
        // if (this.isCollecting) {
        //     this.collectionProgress += deltaTime;
        // }
    }

    render(ctx, isViewerPredator = false) {
        const size = this.radius * 2;
        const halfSize = this.radius;
        let renderColor = '#000000'; // Черный по умолчанию

        if (isViewerPredator) {
            renderColor = 'rgb(128, 128, 128)'; // Серый для Хищника
        }

        ctx.save();
        ctx.translate(this.x, this.y);

        // Рисуем основной квадрат
        ctx.fillStyle = renderColor;
        ctx.fillRect(-halfSize, -halfSize, size, size);

        // Рисуем индикатор сбора, если активен
        if (this.isCollecting) {
            const progressRatio = this.collectionProgress / this.collectionDuration;
            const endAngle = -Math.PI / 2 + (Math.PI * 2 * progressRatio); // Начинаем сверху и идем по часовой

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, this.radius * 1.2, -Math.PI / 2, endAngle); // Чуть больше радиуса
            ctx.closePath();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; // Полупрозрачный белый
            ctx.fill();
        }

        ctx.restore();
    }
} 