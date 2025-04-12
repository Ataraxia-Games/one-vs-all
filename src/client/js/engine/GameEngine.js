export class GameEngine {
    constructor(ctx) {
        this.ctx = ctx;
        this.entities = [];
        this.walls = []; // Store walls separately for collision checks
        this.bullets = []; // Отдельный массив для пуль
        this.effects = []; // Массив для визуальных эффектов (круги)
    }

    addEntity(entity) {
        this.entities.push(entity);
        // Check if it's a wall and add to the walls list
        if (entity.constructor.name === 'Wall') { 
            this.walls.push(entity);
        }
        // Пули добавляются отдельно через addBullet
    }

    addBullet(bullet) {
        this.bullets.push(bullet);
    }

    addEffect(effect) {
        this.effects.push(effect);
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

    // Метод для удаления неактивных пуль
    cleanupBullets() {
        this.bullets = this.bullets.filter(bullet => bullet.isActive);
    }

    cleanupEffects() {
        this.effects = this.effects.filter(effect => effect.isActive);
    }

    update(deltaTime, input) {
        // Pass the list of walls and the full input object to player update
        this.entities.forEach(entity => {
            if (entity.update) {
                if (entity.constructor.name === 'Player') {
                    entity.update(deltaTime, input, this.walls);
                } else {
                    // Pass full input to other entities too, if they need it
                    entity.update(deltaTime, input);
                }
            }
        });

        // Обновляем пули
        this.bullets.forEach(bullet => {
            bullet.update(deltaTime, this.walls);
        });

        // Обновляем эффекты
        this.effects.forEach(effect => {
            effect.update(deltaTime);
        });

        // Очистка
        this.cleanupBullets();
        this.cleanupEffects();
    }

    render() {
        // Рендерим основные сущности (игроки, стены)
        this.entities.forEach(entity => {
            if (entity.render) {
                entity.render(this.ctx);
            }
        });

        // Рендерим пули
        this.bullets.forEach(bullet => {
            bullet.render(this.ctx);
        });

        // ЭФФЕКТЫ БОЛЬШЕ НЕ РЕНДЕРЯТСЯ ЗДЕСЬ
        // this.effects.forEach(effect => {
        //     effect.render(this.ctx);
        // });
    }
} 