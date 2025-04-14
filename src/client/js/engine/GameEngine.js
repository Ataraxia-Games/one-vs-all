import { Player } from '../entities/Player.js'; // Убедимся, что Player импортирован
import { Wall } from '../entities/Wall.js'; // Убедимся, что Wall импортирован

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
        // console.log("Adding effect:", effect.constructor.name); // DEBUG
        this.effects.push(effect);
    }

    // Метод для удаления конкретной пули
    removeBullet(bulletToRemove) {
        this.bullets = this.bullets.filter(bullet => bullet !== bulletToRemove);
    }

    // Метод для удаления ВСЕХ сущностей, пуль и эффектов
    clearAllEntities() {
        this.entities = [];
        this.walls = [];
        this.bullets = [];
        this.effects = [];
        console.log("Cleared all entities from GameEngine.");
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

    // Новый метод для очистки стен
    clearWalls() {
        // Удаляем стены из основного массива entities
        this.entities = this.entities.filter(entity => entity.constructor.name !== 'Wall');
        // Очищаем специализированный массив walls
        this.walls = [];
        console.log("Cleared existing walls."); // Сообщение для отладки
    }

    update(deltaTime, input) {
        const gameApi = { addBullet: (b) => this.addBullet(b) }; 
        let player = null; // Найдем игрока

        // Первый проход - обновить игрока и найти его
        this.entities.forEach(entity => {
            if (entity.constructor.name === 'Player') {
                player = entity; // Сохраняем ссылку на игрока
                if (entity.update) {
                    entity.update(deltaTime, input, this.walls);
                }
            }
        });

        // Второй проход - обновить ботов и другие сущности
        this.entities.forEach(entity => {
            if (entity.constructor.name === 'Bot') {
                if (entity.update && player) { // Передаем игрока боту
                    entity.update(deltaTime, this.walls, gameApi, player);
                }
            } else if (entity.constructor.name !== 'Player') { // Обновляем все, кроме игрока (уже обновлен)
                if (entity.update) {
                    entity.update(deltaTime, input); 
                }
            }
        });

        // Обновляем пули
        this.bullets.forEach(bullet => {
            bullet.update(deltaTime, this.walls);
        });

        // --- Проверка столкновений Пуля-Игрок ---
        if (player) { // Если игрок существует
             // Фильтруем пули: проверяем столкновение и наносим урон
            this.bullets = this.bullets.filter(bullet => {
                if (!bullet.isActive) return false; // Пропускаем уже неактивные

                const dx = bullet.x - player.x;
                const dy = bullet.y - player.y;
                const distSq = dx * dx + dy * dy;
                
                // Простое столкновение кругов
                if (distSq < (bullet.radius + player.radius) * (bullet.radius + player.radius)) {
                    player.takeDamage(10); // Пример: каждая пуля наносит 10 урона
                    bullet.isActive = false; // Деактивируем пулю при попадании
                    return false; // Удаляем пулю из массива
                }
                return true; // Оставляем пулю, если не попала
            });
        }
        // --- Конец проверки Пуля-Игрок ---

        // Обновляем эффекты
        this.effects.forEach(effect => {
            effect.update(deltaTime);
        });

        // Очистка
        this.cleanupBullets();
        this.cleanupEffects();
    }

    render(myPlayerId, isPlayerPredator) {
        // Рендерим основные сущности (игроки, стены)
        this.entities.forEach(entity => {
            if (entity.render) {
                if (entity instanceof Player) { // Проверяем, является ли сущность игроком
                    entity.render(this.ctx, entity.id === myPlayerId); // Передаем флаг isSelf
                } else if (entity instanceof Wall) { // Проверяем, стена ли это
                    entity.render(this.ctx, isPlayerPredator); // Передаем флаг хищника стене
                } else {
                    entity.render(this.ctx); // Обычный рендер для других сущностей
                }
            }
        });

        // Рендерим пули
        this.bullets.forEach(bullet => {
            if (bullet.render) { // Добавим проверку на всякий случай
                 bullet.render(this.ctx);
            }
        });

        // ЭФФЕКТЫ БОЛЬШЕ НЕ РЕНДЕРЯТСЯ ЗДЕСЬ
    }
} 