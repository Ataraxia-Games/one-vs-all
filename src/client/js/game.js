import { GameEngine } from './engine/GameEngine.js';
import { Player } from './entities/Player.js';
import { Wall } from './entities/Wall.js';
import { MapGenerator } from './entities/MapGenerator.js';
import { InputHandler } from './input/InputHandler.js';
import { intersectSegments } from './utils/geometry.js'; // Импортируем утилиту

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
        // Create player in the center of the world
        this.player = new Player(this.worldWidth / 2, this.worldHeight / 2);
        this.gameEngine.addEntity(this.player);

        // Generate boundary walls for the world
        const mapGenerator = new MapGenerator(this.worldWidth, this.worldHeight);
        const boundaryWalls = mapGenerator.getWalls(); // Now returns Wall instances

        // Add boundary walls to game engine
        boundaryWalls.forEach(wall => {
            this.gameEngine.addEntity(wall); // Add Wall instance directly
        });
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        // Also resize the offscreen fog canvas
        this.fogCanvas.width = this.canvas.width;
        this.fogCanvas.height = this.canvas.height;
    }

    gameLoop(timestamp) {
        const deltaTime = (timestamp - this.lastTime) || 0; // Ensure deltaTime is not NaN on first frame
        this.lastTime = timestamp;

        // Update game state
        this.update(deltaTime);
        
        // Render game
        this.render();
        
        // Request next frame
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

        // --- Calculate World Mouse Coordinates ---
        const cameraX = this.canvas.width / 2 - this.player.x * this.zoom;
        const cameraY = this.canvas.height / 2 - this.player.y * this.zoom;
        const worldMouseX = (input.rawMouseX - cameraX) / this.zoom;
        const worldMouseY = (input.rawMouseY - cameraY) / this.zoom;
        
        // Prepare input object for game engine
        const inputForEngine = {
            keys: input.keys,
            mouse: { x: worldMouseX, y: worldMouseY } 
        };

        this.gameEngine.update(deltaTime, inputForEngine);
    }

    render() {
        // Clear main canvas
        this.ctx.fillStyle = '#1a1a1a'; 
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

        // Создаем полигон видимости на fogCanvas
        if (visibilityPoints.length > 0) {
            this.fogCtx.beginPath();
            this.fogCtx.moveTo(playerScreenX, playerScreenY); // Начинаем с игрока
            visibilityPoints.forEach(p => this.fogCtx.lineTo(p.x, p.y));
            this.fogCtx.closePath();

            // Создаем радиальный градиент для плавного края
            // Радиус градиента соответствует максимальной дальности лучей на экране
            const screenViewRadius = worldViewRadius * this.zoom;
            const gradient = this.fogCtx.createRadialGradient(
                playerScreenX, playerScreenY, screenViewRadius * 0.2, // Inner circle (почти полностью прозрачный туман)
                playerScreenX, playerScreenY, screenViewRadius      // Outer circle (полностью непрозрачный туман)
            );
            gradient.addColorStop(0, 'rgba(0, 0, 0, 1)'); // Opaque alpha at center (clears fog)
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Transparent alpha at edge (keeps fog)

            // Вырезаем полигон из тумана, используя градиент
            this.fogCtx.globalCompositeOperation = 'destination-out';
            this.fogCtx.fillStyle = gradient; // Используем градиент для заливки
            this.fogCtx.fill();
            this.fogCtx.globalCompositeOperation = 'source-over'; 
        }

        // Рисуем результат поверх мира
        this.ctx.drawImage(this.fogCanvas, 0, 0);
        // --- End Fog of War ---

        // --- Render Custom Crosshair ---
        const mouseInput = this.inputHandler.getInput(); // Get latest raw mouse coords
        if (mouseInput.rawMouseX !== undefined && mouseInput.rawMouseY !== undefined) {
            const crosshairRadius = 10; // Базовый радиус прицела
            // Масштабируем радиус прицела вместе с зумом мира для консистентности
            const scaledRadius = crosshairRadius * this.zoom; // Вариант 1: Масштабируется с миром
            //const scaledRadius = crosshairRadius; // Вариант 2: Фиксированный размер на экране

            this.ctx.strokeStyle = '#ffffff'; // Белый цвет
            this.ctx.lineWidth = 1; // Толщина 1 пиксель
            this.ctx.beginPath();
            this.ctx.arc(mouseInput.rawMouseX, mouseInput.rawMouseY, scaledRadius, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        // --- End Custom Crosshair ---
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new Game();
}); 