export class GameEngine {
    constructor(ctx) {
        this.ctx = ctx;
        this.entities = [];
    }

    addEntity(entity) {
        this.entities.push(entity);
    }

    removeEntity(entity) {
        const index = this.entities.indexOf(entity);
        if (index !== -1) {
            this.entities.splice(index, 1);
        }
    }

    update(deltaTime, input) {
        this.entities.forEach(entity => {
            if (entity.update) {
                entity.update(deltaTime, input);
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