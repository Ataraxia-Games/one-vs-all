import { GameEngine } from './engine/GameEngine.js';
import { Player } from './entities/Player.js';
import { Wall } from './entities/Wall.js';
import { MapGenerator } from './entities/MapGenerator.js';
import { InputHandler } from './input/InputHandler.js';
import { intersectSegments } from './utils/geometry.js'; // Импортируем утилиту
import { SpeedCircle } from './entities/SpeedCircle.js';
import { Bot } from './entities/Bot.js'; // Импортируем Bot

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Create offscreen canvas for fog of war
        this.fogCanvas = document.createElement('canvas');
        this.fogCtx = this.fogCanvas.getContext('2d');

        this.worldWidth = 2000 * 1.3;
        this.worldHeight = 2000 * 1.3;

        this.gameEngine = new GameEngine(this.ctx);
        this.inputHandler = new InputHandler();
        
        // Zoom properties
        this.zoom = 1.0;
        this.minZoom = 0.3;
        this.maxZoom = 2.5;
        this.zoomSpeed = 0.001;

        // FOV properties
        this.baseWorldViewRadius = 700;
        this.currentWorldViewRadius = this.baseWorldViewRadius; 
        this.targetWorldViewRadius = this.baseWorldViewRadius; 
        this.baseFovAngle = Math.PI / 2; // 90 degrees
        this.currentFovAngle = this.baseFovAngle;
        this.targetFovAngle = this.baseFovAngle;
        this.fovTransitionSpeed = 0.1; 

        // Crosshair properties
        this.baseCrosshairRadius = 20; // Базовый радиус (увеличен)
        this.targetCrosshairRadius = this.baseCrosshairRadius;
        this.currentCrosshairRadius = this.baseCrosshairRadius;
        this.crosshairTransitionSpeed = 0.15; // Скорость изменения прицела

        // Set canvas size (will also resize fogCanvas)
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Initialize game objects
        this.initGame();
        
        // Start game loop
        this.lastTime = 0;
        this.gameLoop(0);
    }

    initGame() {
        this.player = new Player(this.worldWidth / 2, this.worldHeight / 2);
        this.player.onSpeedCircle = (x, y) => {
            this.gameEngine.addEffect(new SpeedCircle(x, y));
        };
        this.gameEngine.addEntity(this.player);

        // Generate boundary walls for the world
        const mapGenerator = new MapGenerator(this.worldWidth, this.worldHeight);
        const boundaryWalls = mapGenerator.getWalls(); // Now returns Wall instances

        // Add boundary walls to game engine
        boundaryWalls.forEach(wall => {
            this.gameEngine.addEntity(wall); // Add Wall instance directly
        });

        // --- Создаем ботов ---
        const numBots = 5;
        const padding = 200; // Отступ от краев для спавна
        for (let i = 0; i < numBots; i++) {
            const botX = padding + Math.random() * (this.worldWidth - 2 * padding);
            const botY = padding + Math.random() * (this.worldHeight - 2 * padding);
            const bot = new Bot(botX, botY);
            // Привязываем обработчик для создания кругов (как у игрока)
            bot.onSpeedCircle = (x, y) => {
                // console.log(`Bot ${i} emitted speed circle at ${x.toFixed(0)}, ${y.toFixed(0)}`); // DEBUG
                this.gameEngine.addEffect(new SpeedCircle(x, y));
            };
            this.gameEngine.addEntity(bot);
        }
        // --- Конец создания ботов ---
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        // Also resize the offscreen fog canvas
        this.fogCanvas.width = this.canvas.width;
        this.fogCanvas.height = this.canvas.height;
    }

    gameLoop(timestamp) {
        const deltaTime = (timestamp - this.lastTime) || 0; 
        this.lastTime = timestamp;

        // Update game state and get input
        const input = this.update(deltaTime);
        
        // Render game, passing the input
        this.render(input); 
        
        requestAnimationFrame((time) => this.gameLoop(time));
    }

    update(deltaTime) {
        const input = this.inputHandler.getInput(); 

        // --- Update Zoom ---
        if (input.wheelDelta !== 0) {
            const zoomAmount = input.wheelDelta * this.zoomSpeed;
            this.zoom -= zoomAmount;
            this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));
        }

        // --- Update Target FOV Radius & Angle based on RMB ---
        if (input.isRightMouseDown) {
            this.targetWorldViewRadius = this.baseWorldViewRadius * 1.3; // Increase radius
            this.targetFovAngle = Math.PI / 3; // Narrow angle to 60 degrees
        } else {
            this.targetWorldViewRadius = this.baseWorldViewRadius * 0.8; // Decrease radius
            this.targetFovAngle = this.baseFovAngle; // Restore base angle (90 degrees)
        }

        // --- Smoothly Interpolate Current FOV Radius & Angle ---
        this.currentWorldViewRadius += (this.targetWorldViewRadius - this.currentWorldViewRadius) * this.fovTransitionSpeed;
        this.currentFovAngle += (this.targetFovAngle - this.currentFovAngle) * this.fovTransitionSpeed;

        // --- Update Target & Interpolate Crosshair Radius ---
        if (input.isRightMouseDown) {
            this.targetCrosshairRadius = this.baseCrosshairRadius / 2; 
        } else {
            this.targetCrosshairRadius = this.baseCrosshairRadius; 
        }
        const prevCrosshairRadius = this.currentCrosshairRadius;
        this.currentCrosshairRadius += (this.targetCrosshairRadius - this.currentCrosshairRadius) * this.crosshairTransitionSpeed;
        // --- DEBUG LOG --- 
        // if (Math.abs(prevCrosshairRadius - this.currentCrosshairRadius) > 0.1) {
        //     console.log(`RMB: ${input.isRightMouseDown}, TargetR: ${this.targetCrosshairRadius.toFixed(1)}, CurrentR: ${this.currentCrosshairRadius.toFixed(1)}`);
        // }
        // --- END DEBUG LOG ---

        // --- Calculate World Mouse Coordinates ---
        const cameraX = this.canvas.width / 2 - this.player.x * this.zoom;
        const cameraY = this.canvas.height / 2 - this.player.y * this.zoom;
        const worldMouseX = (input.rawMouseX - cameraX) / this.zoom;
        const worldMouseY = (input.rawMouseY - cameraY) / this.zoom;
        
        // Add calculated world mouse coordinates to the main input object
        input.mouse = { x: worldMouseX, y: worldMouseY }; 

        // Pass the FULL input object to the engine
        this.gameEngine.update(deltaTime, input);

        // --- Handle Shooting Input ---
        if (input.isLeftMouseClick) {
            const newBullets = this.player.shoot();
            if (newBullets.length > 0) {
                newBullets.forEach(bullet => this.gameEngine.addBullet(bullet));
            }
        }

        // Return the input object for render method
        return input;
    }

    render(input) {
        // --- Calculate Background Color based on Health ---
        let backgroundColor = 'rgb(78, 87, 40)'; // Default/fallback
        if (this.player) { // Убедимся, что игрок создан
            const healthPercent = Math.max(0, Math.min(1, this.player.currentHealth / this.player.maxHealth));
            
            // Цвета: 100% -> Желто-зеленый, 0% -> Красный
            const fullHealthColor = { r: 78, g: 87, b: 40 }; // Базовый желто-зеленый
            const zeroHealthColor = { r: 120, g: 0, b: 0 }; // Темно-красный

            // Линейная интерполяция (lerp)
            const r = Math.round(fullHealthColor.r + (zeroHealthColor.r - fullHealthColor.r) * (1 - healthPercent));
            const g = Math.round(fullHealthColor.g + (zeroHealthColor.g - fullHealthColor.g) * (1 - healthPercent));
            const b = Math.round(fullHealthColor.b + (zeroHealthColor.b - fullHealthColor.b) * (1 - healthPercent));

            backgroundColor = `rgb(${r}, ${g}, ${b})`;
        }

        // Clear main canvas with calculated background color
        this.ctx.fillStyle = backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // --- Render world with camera offset AND zoom ---
        this.ctx.save(); 
        const cameraX = this.canvas.width / 2 - this.player.x * this.zoom;
        const cameraY = this.canvas.height / 2 - this.player.y * this.zoom;
        this.ctx.translate(cameraX, cameraY);
        this.ctx.scale(this.zoom, this.zoom);
        this.gameEngine.render(); // Render world entities
        this.ctx.restore(); 
        // --- End world rendering ---
        
        // --- Render Fog of War using Raycasting --- 
        this.fogCtx.clearRect(0, 0, this.fogCanvas.width, this.fogCanvas.height);
        this.fogCtx.fillStyle = 'rgba(0, 0, 0, 1)'; // Solid black fog
        this.fogCtx.fillRect(0, 0, this.fogCanvas.width, this.fogCanvas.height);

        const playerScreenX = this.fogCanvas.width / 2;
        const playerScreenY = this.fogCanvas.height / 2;

        // Raycasting parameters - use current interpolated values
        const numRays = 120; 
        const fovAngle = this.currentFovAngle; // Используем текущий угол!
        const worldViewRadius = this.currentWorldViewRadius; 
        const angleStep = fovAngle / numRays;
        const startAngle = this.player.angle - fovAngle / 2;

        const visibilityPoints = []; // Точки для полигона видимости (в координатах fogCanvas)

        for (let i = 0; i <= numRays; i++) {
            const currentAngle = startAngle + i * angleStep;
            
            // Конечная точка луча на максимальной дальности
            const rayEndXWorld = this.player.x + worldViewRadius * Math.cos(currentAngle);
            const rayEndYWorld = this.player.y + worldViewRadius * Math.sin(currentAngle);

            let closestHit = null;
            let minHitDistSq = worldViewRadius * worldViewRadius;

            // Проверяем пересечение луча со всеми СТОРОНАМИ всех стен
            for (const wall of this.gameEngine.walls) {
                // Итерируем по 4 сегментам (сторонам) стены
                for (let j = 0; j < wall.corners.length; j++) {
                    const corner1 = wall.corners[j];
                    const corner2 = wall.corners[(j + 1) % wall.corners.length]; // Следующий угол (замыкаем)

                    const hit = intersectSegments(
                        this.player.x, this.player.y, rayEndXWorld, rayEndYWorld, // Луч
                        corner1.x, corner1.y, corner2.x, corner2.y // Сегмент стены
                    );

                    if (hit) {
                        const dx = hit.x - this.player.x;
                        const dy = hit.y - this.player.y;
                        const distSq = dx * dx + dy * dy;
                        if (distSq < minHitDistSq) {
                            minHitDistSq = distSq;
                            closestHit = hit;
                        }
                    }
                }
            }

            let finalPointWorldX, finalPointWorldY;
            if (closestHit) {
                // Используем точку пересечения
                finalPointWorldX = closestHit.x;
                finalPointWorldY = closestHit.y;
            } else {
                // Используем конец луча
                finalPointWorldX = rayEndXWorld;
                finalPointWorldY = rayEndYWorld;
            }

            // Преобразуем конечную точку луча в координаты fogCanvas
            const finalPointScreenX = playerScreenX + (finalPointWorldX - this.player.x) * this.zoom;
            const finalPointScreenY = playerScreenY + (finalPointWorldY - this.player.y) * this.zoom;
            visibilityPoints.push({ x: finalPointScreenX, y: finalPointScreenY });
        }

        // --- Create visibility polygon and gradient --- 
        if (visibilityPoints.length > 0) {
            // --- Cutout Main FOV Polygon ---
            this.fogCtx.beginPath();
            this.fogCtx.moveTo(playerScreenX, playerScreenY); 
            visibilityPoints.forEach(p => this.fogCtx.lineTo(p.x, p.y));
            this.fogCtx.closePath();

            // Main FOV gradient (based on raycast distance)
            const screenViewRadius = this.currentWorldViewRadius * this.zoom;
            const fovGradient = this.fogCtx.createRadialGradient( 
                playerScreenX, playerScreenY, screenViewRadius * 0.2, 
                playerScreenX, playerScreenY, screenViewRadius 
            );
            fovGradient.addColorStop(0, 'rgba(0, 0, 0, 1)'); 
            fovGradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); 

            // Apply main FOV cutout
            this.fogCtx.globalCompositeOperation = 'destination-out';
            this.fogCtx.fillStyle = fovGradient; 
            this.fogCtx.fill();
            // Keep globalCompositeOperation as 'destination-out' for the next step

            // --- Cutout Close-Range Circle ---
            const closeRadiusWorld = 100; // Увеличено (было 70)
            const closeRadiusScreen = closeRadiusWorld * this.zoom;
            
            // Close-range gradient
            const closeGradient = this.fogCtx.createRadialGradient(
                playerScreenX, playerScreenY, 0, // Start fully clear at the center
                playerScreenX, playerScreenY, closeRadiusScreen // Fade to fully fogged at edge
            );
            closeGradient.addColorStop(0, 'rgba(0, 0, 0, 1)'); // Clear fog at center
            closeGradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Keep fog at edge
            
            // Draw the circle for close range view
            this.fogCtx.beginPath();
            this.fogCtx.arc(playerScreenX, playerScreenY, closeRadiusScreen, 0, Math.PI * 2);
            this.fogCtx.closePath();
            
            // Apply close-range cutout (still using destination-out)
            this.fogCtx.fillStyle = closeGradient;
            this.fogCtx.fill();

            // Reset composite operation only after both cutouts are done
            this.fogCtx.globalCompositeOperation = 'source-over'; 
        }

        // Draw fog canvas
        this.ctx.drawImage(this.fogCanvas, 0, 0);
        // --- End Fog of War ---

        // --- Render World Effects (e.g., speed circles) OVER the fog ---
        // Apply camera transform again for world-based effects
        this.ctx.save();
        this.ctx.translate(cameraX, cameraY); // Используем те же cameraX, cameraY, что и для мира
        this.ctx.scale(this.zoom, this.zoom);

        this.gameEngine.effects.forEach(effect => {
            if (effect.render) { // Проверяем, есть ли метод render
                effect.render(this.ctx);
            }
        });

        this.ctx.restore(); // Убираем трансформацию камеры для эффектов
        // --- End World Effects ---

        // --- Render Custom Crosshair ---
        if (input.rawMouseX !== undefined && input.rawMouseY !== undefined) {
            const crosshairRadius = this.currentCrosshairRadius; 
            const scaledRadius = crosshairRadius * this.zoom; 
            this.ctx.strokeStyle = '#ffffff'; 
            this.ctx.lineWidth = 1; 
            this.ctx.beginPath();
            this.ctx.arc(input.rawMouseX, input.rawMouseY, scaledRadius, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        // --- End Custom Crosshair ---
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new Game();
}); 