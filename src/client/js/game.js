import { GameEngine } from './engine/GameEngine.js';
import { Player } from './entities/Player.js';
import { Wall } from './entities/Wall.js';
import { MapGenerator } from './entities/MapGenerator.js';
import { InputHandler } from './input/InputHandler.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Create offscreen canvas for fog of war
        this.fogCanvas = document.createElement('canvas');
        this.fogCtx = this.fogCanvas.getContext('2d');

        this.worldWidth = 2000;
        this.worldHeight = 2000;

        this.gameEngine = new GameEngine(this.ctx);
        this.inputHandler = new InputHandler();
        
        // Zoom properties
        this.zoom = 1.0;
        this.minZoom = 0.3;
        this.maxZoom = 2.5;
        this.zoomSpeed = 0.001;

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
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // Update game state
        this.update(deltaTime);
        
        // Render game
        this.render();
        
        // Request next frame
        requestAnimationFrame((time) => this.gameLoop(time));
    }

    update(deltaTime) {
        const rawInput = this.inputHandler.getInput();

        // --- Update Zoom ---
        if (rawInput.wheelDelta !== 0) {
            const zoomAmount = rawInput.wheelDelta * this.zoomSpeed;
            this.zoom -= zoomAmount;
            // Clamp zoom level
            this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));
        }

        // --- Calculate World Mouse Coordinates (considering camera and zoom) ---
        // Camera offset calculation (before zoom) - needed for world coords
        const cameraX = this.canvas.width / 2 - this.player.x * this.zoom;
        const cameraY = this.canvas.height / 2 - this.player.y * this.zoom;
        
        const worldMouseX = (rawInput.rawMouseX - cameraX) / this.zoom;
        const worldMouseY = (rawInput.rawMouseY - cameraY) / this.zoom;
        
        // Prepare input object for game engine
        const inputForEngine = {
            keys: rawInput.keys,
            mouse: { x: worldMouseX, y: worldMouseY } 
        };

        this.gameEngine.update(deltaTime, inputForEngine);
    }

    render() {
        // Clear main canvas with gray background
        this.ctx.fillStyle = '#1a1a1a'; // Restore background color
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); // Restore background fill

        // --- Render world with camera offset AND zoom (Re-enabled) ---
        this.ctx.save(); 
        // Center camera on player
        const cameraX = this.canvas.width / 2 - this.player.x * this.zoom;
        const cameraY = this.canvas.height / 2 - this.player.y * this.zoom;
        this.ctx.translate(cameraX, cameraY);
        // Apply zoom
        this.ctx.scale(this.zoom, this.zoom);
        
        // Render all entities onto main canvas (now scaled and translated)
        this.gameEngine.render(); 
        this.ctx.restore(); 
        // --- End world rendering ---
        

        // --- Render Fog of War using offscreen canvas --- 
        this.fogCtx.clearRect(0, 0, this.fogCanvas.width, this.fogCanvas.height);
        this.fogCtx.fillStyle = 'rgba(0, 0, 0, 1)';
        this.fogCtx.fillRect(0, 0, this.fogCanvas.width, this.fogCanvas.height);

        const playerScreenX = this.fogCanvas.width / 2;
        const playerScreenY = this.fogCanvas.height / 2;
        
        // Define FOV properties in world units
        const fovAngle = Math.PI / 2; // 90 degrees
        const worldViewRadius = 500; // Fixed distance in world pixels

        // Calculate screen radius based on world radius and zoom
        let screenViewRadius = worldViewRadius * this.zoom;
        screenViewRadius = Math.max(1, screenViewRadius); // Ensure radius is positive

        // Draw the arc using screen radius
        this.fogCtx.beginPath();
        this.fogCtx.moveTo(playerScreenX, playerScreenY);
        this.fogCtx.arc(
            playerScreenX, playerScreenY, 
            screenViewRadius, // Use screen radius for drawing
            this.player.angle - fovAngle / 2, 
            this.player.angle + fovAngle / 2
        );
        this.fogCtx.closePath();
        
        // Create radial gradient using screen radius
        const gradient = this.fogCtx.createRadialGradient(
            playerScreenX, playerScreenY, screenViewRadius * 0.5, // Inner circle (scaled by zoom)
            playerScreenX, playerScreenY, screenViewRadius      // Outer circle (scaled by zoom)
        );
        gradient.addColorStop(0, 'rgba(0, 0, 0, 1)'); // Opaque alpha at center
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Transparent alpha at edge

        // Cutout using destination-out and the gradient
        this.fogCtx.globalCompositeOperation = 'destination-out';
        this.fogCtx.fillStyle = gradient;
        this.fogCtx.fill();
        this.fogCtx.globalCompositeOperation = 'source-over'; 

        // Draw the prepared fog canvas over the world
        this.ctx.drawImage(this.fogCanvas, 0, 0);
        // --- End Fog of War ---
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new Game();
}); 