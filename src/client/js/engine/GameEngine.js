export class GameEngine {
    constructor(ctx) {
        this.ctx = ctx;
        this.entities = [];
        this.walls = []; // Store walls separately for collision checks
    }

    addEntity(entity) {
        this.entities.push(entity);
        // Check if it's a wall and add to the walls list
        if (entity.constructor.name === 'Wall') { 
            this.walls.push(entity);
        }
    }

    removeEntity(entity) {
        const index = this.entities.indexOf(entity);
        if (index !== -1) {
            this.entities.splice(index, 1);
        }
        // Also remove from walls list if it was a wall
        if (entity.constructor.name === 'Wall') {
            const wallIndex = this.walls.indexOf(entity);
            if (wallIndex !== -1) {
                this.walls.splice(wallIndex, 1);
            }
        }
    }

    update(deltaTime, input) {
        // Pass the list of walls to player update
        this.entities.forEach(entity => {
            if (entity.update) {
                if (entity.constructor.name === 'Player') {
                    entity.update(deltaTime, input, this.walls);
                } else {
                    entity.update(deltaTime, input); // Other entities don't need walls
                }
            }
        });
    }

    render() {
        this.entities.forEach(entity => {
            if (entity.render) {
                entity.render(this.ctx);
            }
        });
    }
} 