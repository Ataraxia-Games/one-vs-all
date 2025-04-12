export class SpeedCircle {
    constructor(x, y, maxRadius = 150, duration = 800, color = 'rgba(255, 255, 255, 0.5)') {
        this.x = x;
        this.y = y;
        this.maxRadius = maxRadius;
        this.duration = duration; // ms
        this.initialColor = color; 

        this.currentRadius = 0;
        this.timeAlive = 0;
        this.isActive = true;
    }

    update(deltaTime) {
        if (!this.isActive) return;

        this.timeAlive += deltaTime;
        const progress = this.timeAlive / this.duration;

        if (progress >= 1) {
            this.isActive = false;
            return;
        }

        // Анимация: радиус растет, прозрачность падает
        this.currentRadius = this.maxRadius * progress;
        // Пример затухания: альфа уменьшается к концу жизни
        const alpha = parseFloat(this.initialColor.split(',')[3] || '1)') * (1 - progress);
        this.currentColor = `rgba(${this.initialColor.split('(')[1].split(',').slice(0, 3).join(',')}, ${alpha.toFixed(2)})`;
    }

    render(ctx) {
        if (!this.isActive) return;

        ctx.strokeStyle = this.currentColor;
        ctx.lineWidth = 2; // Толщина линии круга
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.currentRadius, 0, Math.PI * 2);
        ctx.stroke();
    }
} 