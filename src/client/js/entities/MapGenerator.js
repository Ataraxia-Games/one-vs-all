export class MapGenerator {
    constructor(canvasWidth, canvasHeight) {
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.walls = [];
        this.generateWalls();
    }

    generateWalls() {
        const numWalls = 20; // Количество стен
        const minLength = 50;
        const maxLength = 200;

        for (let i = 0; i < numWalls; i++) {
            const x = Math.random() * this.canvasWidth;
            const y = Math.random() * this.canvasHeight;
            const length = minLength + Math.random() * (maxLength - minLength);
            const angle = Math.random() * Math.PI * 2; // Случайный угол от 0 до 2π

            this.walls.push({
                x,
                y,
                length,
                angle
            });
        }
    }

    getWalls() {
        return this.walls;
    }
} 