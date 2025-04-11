import { Wall } from './Wall.js';

export class MapGenerator {
    constructor(worldWidth, worldHeight) {
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        this.walls = [];
        this.generateBoundaryWalls();
        this.generateInnerWalls();
    }

    generateBoundaryWalls() {
        const centerX = this.worldWidth / 2;
        const centerY = this.worldHeight / 2;
        const numVertices = 15; // Количество вершин многоугольника
        const radius = Math.min(this.worldWidth, this.worldHeight) / 2 * 0.9; // Радиус чуть меньше границ
        const angleStep = (Math.PI * 2) / numVertices;

        const vertices = [];
        for (let i = 0; i < numVertices; i++) {
            // Добавляем случайность к углу и радиусу для неровной формы
            const currentAngle = i * angleStep + (Math.random() - 0.5) * angleStep * 0.8;
            const currentRadius = radius * (0.8 + Math.random() * 0.4);

            const x = centerX + currentRadius * Math.cos(currentAngle);
            const y = centerY + currentRadius * Math.sin(currentAngle);
            vertices.push({ x, y });
        }

        // Создаем стены между вершинами
        for (let i = 0; i < numVertices; i++) {
            const start = vertices[i];
            const end = vertices[(i + 1) % numVertices]; // Следующая вершина, замыкаем круг

            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);

            // Центр стены - это середина отрезка между вершинами
            const wallX = start.x + dx / 2;
            const wallY = start.y + dy / 2;

            // Создаем черную стену
            this.walls.push(new Wall(wallX, wallY, length, angle, '#000000')); 
        }
    }

    generateInnerWalls() {
        const numInnerWalls = 50; // Количество внутренних стен
        const minLength = 80;
        const maxLength = 300;
        const padding = 100; // Отступ от краев мира

        for (let i = 0; i < numInnerWalls; i++) {
            // Генерируем позицию внутри мира с отступами
            const x = padding + Math.random() * (this.worldWidth - 2 * padding);
            const y = padding + Math.random() * (this.worldHeight - 2 * padding);
            
            const length = minLength + Math.random() * (maxLength - minLength);
            const angle = Math.random() * Math.PI * 2; 

            // Создаем черную внутреннюю стену
            this.walls.push(new Wall(x, y, length, angle, '#000000')); 
        }
    }

    getWalls() {
        return this.walls;
    }
} 