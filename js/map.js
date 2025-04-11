export class Map {
    constructor(canvasWidth, canvasHeight) {
        this.walls = [];
        this.boundaries = [];
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.generateBoundaries();
        this.generateWalls();
    }

    generateBoundaries() {
        const numPoints = Math.floor(Math.random() * 20) + 30; // 30-50 points
        const centerX = 0; // Центр в начале координат
        const centerY = 0;
        const minRadius = 1332; // Увеличено в 2 раза
        const maxRadius = 2000; // Увеличено в 2 раза

        // Generate points in a circle with random radius
        const points = [];
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const radius = minRadius + Math.random() * (maxRadius - minRadius);
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            points.push({ x, y });
        }

        // Create walls from points
        for (let i = 0; i < points.length; i++) {
            const current = points[i];
            const next = points[(i + 1) % points.length];
            
            this.boundaries.push({
                x: current.x,
                y: current.y,
                endX: next.x,
                endY: next.y
            });
        }
    }

    generateWalls() {
        // Generate 60 random walls inside the boundaries
        for (let i = 0; i < 60; i++) {
            const length = Math.random() * 200 + 100; // Random length between 100 and 300
            const angle = Math.random() * Math.PI * 2; // Random angle
            
            // Generate random position within boundaries
            let x, y;
            do {
                x = (Math.random() - 0.5) * 4000; // От -2000 до 2000
                y = (Math.random() - 0.5) * 4000; // От -2000 до 2000
            } while (!this.isPointInsideBoundaries(x, y));

            this.walls.push({
                x,
                y,
                length,
                angle,
                endX: x + Math.cos(angle) * length,
                endY: y + Math.sin(angle) * length
            });
        }
    }

    isPointInsideBoundaries(x, y) {
        // Ray casting algorithm to check if point is inside polygon
        let inside = false;
        for (let i = 0, j = this.boundaries.length - 1; i < this.boundaries.length; j = i++) {
            const xi = this.boundaries[i].x;
            const yi = this.boundaries[i].y;
            const xj = this.boundaries[j].x;
            const yj = this.boundaries[j].y;

            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    checkCollision(x, y, radius) {
        // Check collision with boundaries
        for (const wall of this.boundaries) {
            const distance = this.distanceToLine(x, y, wall);
            if (distance < radius + 10) {
                // Проверяем, находится ли проекция точки на отрезке
                const A = x - wall.x;
                const B = y - wall.y;
                const C = wall.endX - wall.x;
                const D = wall.endY - wall.y;
                const dot = A * C + B * D;
                const len_sq = C * C + D * D;
                const param = dot / len_sq;

                if (param >= 0 && param <= 1) {
                    const normal = this.getWallNormal(wall);
                    return {
                        collides: true,
                        normal: normal
                    };
                }
            }
        }

        // Check collision with internal walls
        for (const wall of this.walls) {
            const distance = this.distanceToLine(x, y, wall);
            if (distance < radius + 10) {
                // Проверяем, находится ли проекция точки на отрезке
                const A = x - wall.x;
                const B = y - wall.y;
                const C = wall.endX - wall.x;
                const D = wall.endY - wall.y;
                const dot = A * C + B * D;
                const len_sq = C * C + D * D;
                const param = dot / len_sq;

                if (param >= 0 && param <= 1) {
                    const normal = this.getWallNormal(wall);
                    return {
                        collides: true,
                        normal: normal
                    };
                }
            }
        }

        return { collides: false, normal: { x: 0, y: 0 } };
    }

    getWallNormal(wall) {
        const dx = wall.endX - wall.x;
        const dy = wall.endY - wall.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        return {
            x: -dy / length,
            y: dx / length
        };
    }

    distanceToLine(x, y, wall) {
        const A = x - wall.x;
        const B = y - wall.y;
        const C = wall.endX - wall.x;
        const D = wall.endY - wall.y;

        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq !== 0) {
            param = dot / len_sq;
        }

        let xx, yy;

        if (param < 0) {
            xx = wall.x;
            yy = wall.y;
        } else if (param > 1) {
            xx = wall.endX;
            yy = wall.endY;
        } else {
            xx = wall.x + param * C;
            yy = wall.y + param * D;
        }

        const dx = x - xx;
        const dy = y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    render(ctx) {
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 20; // Толщина стен

        // Render boundaries
        this.boundaries.forEach(wall => {
            ctx.beginPath();
            ctx.moveTo(wall.x, wall.y);
            ctx.lineTo(wall.endX, wall.endY);
            ctx.stroke();
        });

        // Render internal walls
        this.walls.forEach(wall => {
            ctx.beginPath();
            ctx.moveTo(wall.x, wall.y);
            ctx.lineTo(wall.endX, wall.endY);
            ctx.stroke();
        });

        ctx.restore();
    }
} 