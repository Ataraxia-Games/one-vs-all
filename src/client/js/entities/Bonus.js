export class Bonus {
    constructor(id, x, y, type = 'default', amount = 0) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.radius = 15; // Base size
        this.type = type; // Store the type ('default', 'ammo')
        this.amount = amount; // Store the amount (for ammo)
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
        ctx.save();

        // Determine color based on viewer
        const renderColor = isViewerPredator ? 'rgb(128, 128, 128)' : '#000000'; // Grey for Predator, Black for Hunter

        if (this.type === 'ammo') {
            // Ammo bonus: Square with amount text (only for Hunter)
            const size = this.radius * 1.8; // Make square slightly larger
            ctx.fillStyle = renderColor; // Use determined color
            ctx.fillRect(this.x - size / 2, this.y - size / 2, size, size);
        } else {
            // Default/Night bonus: Circle
            ctx.fillStyle = renderColor; // Use determined color
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw collection progress bar (common logic)
        if (this.isCollecting) {
            const progressRatio = this.collectionProgress / this.collectionDuration;
            const endAngle = -Math.PI / 2 + (Math.PI * 2 * progressRatio); // Начинаем сверху и идем по часовой

            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.arc(this.x, this.y, this.radius * 1.2, -Math.PI / 2, endAngle); // Чуть больше радиуса
            ctx.closePath();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; // Полупрозрачный белый
            ctx.fill();
        }

        ctx.restore();
    }
} 