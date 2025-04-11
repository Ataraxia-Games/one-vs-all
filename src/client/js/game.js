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

        this.gameEngine = new GameEngine(this.ctx);
        this.inputHandler = new InputHandler();
        
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
        // Create player
        this.player = new Player(this.canvas.width / 2, this.canvas.height / 2);
        this.gameEngine.addEntity(this.player);

        // Generate map
        const mapGenerator = new MapGenerator(this.canvas.width, this.canvas.height);
        const walls = mapGenerator.getWalls();

        // Add walls to game engine
        walls.forEach(wallData => {
            const wall = new Wall(wallData.x, wallData.y, wallData.length, wallData.angle);
            this.gameEngine.addEntity(wall);
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
        // Calculate camera offset for input handling
        const cameraX = this.canvas.width / 2 - this.player.x;
        const cameraY = this.canvas.height / 2 - this.player.y;

        const input = this.inputHandler.getInput(cameraX, cameraY);
        this.gameEngine.update(deltaTime, input);
    }

    render() {
        // Clear main canvas with gray background
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // --- Render world with camera offset onto main canvas ---
        this.ctx.save(); 
        const cameraX = this.canvas.width / 2 - this.player.x;
        const cameraY = this.canvas.height / 2 - this.player.y;
        this.ctx.translate(cameraX, cameraY);
        this.gameEngine.render(); // Render all entities onto main canvas
        this.ctx.restore(); 
        // --- End world rendering ---

        // --- Render Fog of War using offscreen canvas ---
        
        // 1. Clear the offscreen canvas and fill with solid black fog
        this.fogCtx.clearRect(0, 0, this.fogCanvas.width, this.fogCanvas.height);
        this.fogCtx.fillStyle = 'rgba(0, 0, 0, 1)';
        this.fogCtx.fillRect(0, 0, this.fogCanvas.width, this.fogCanvas.height);

        // 2. Create the field of view (FOV) shape on the offscreen canvas
        const playerScreenX = this.fogCanvas.width / 2;
        const playerScreenY = this.fogCanvas.height / 2;
        const fovAngle = Math.PI / 2; // 90 degrees
        // Shorter view radius
        const viewRadius = Math.min(this.fogCanvas.width, this.fogCanvas.height) * 0.6; 

        this.fogCtx.beginPath();
        this.fogCtx.moveTo(playerScreenX, playerScreenY);
        this.fogCtx.arc(
            playerScreenX, 
            playerScreenY, 
            viewRadius, 
            this.player.angle - fovAngle / 2, 
            this.player.angle + fovAngle / 2
        );
        this.fogCtx.closePath();

        // 3. Create radial gradient for soft edges
        const gradient = this.fogCtx.createRadialGradient(
            playerScreenX, playerScreenY, viewRadius * 0.5, // Inner circle (fully clear)
            playerScreenX, playerScreenY, viewRadius      // Outer circle (fully fogged)
        );
        gradient.addColorStop(0, 'rgba(0, 0, 0, 1)'); // Opaque alpha at center (clears fog)
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Transparent alpha at edge (keeps fog)

        // 4. Use 'destination-out' and fill with the gradient to cut out the FOV with soft edges
        this.fogCtx.globalCompositeOperation = 'destination-out';
        this.fogCtx.fillStyle = gradient;
        this.fogCtx.fill();
        this.fogCtx.globalCompositeOperation = 'source-over'; // Reset composite operation

        // 5. Draw the result (fog with gradient hole) from the offscreen canvas onto the main canvas
        this.ctx.drawImage(this.fogCanvas, 0, 0);
        
        // --- End Fog of War ---
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new Game();
}); 