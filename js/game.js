import { Player } from './player.js';
import { Hunter } from './hunter.js';
import { Predator } from './predator.js';
import { Map } from './map.js';

export class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Set initial canvas size to window size
        this.resizeCanvas();
        
        // Initialize map
        this.map = new Map(this.canvas.width, this.canvas.height);
        
        // Game state
        this.players = [];
        this.gameTime = 300; // 5 minutes in seconds
        this.isGameRunning = false;
        
        // Input handling
        this.keys = {};
        this.mouse = { x: 0, y: 0, rawX: 0, rawY: 0 };
        this.activePlayer = null; // The player being controlled
        this.scale = 1; // Добавляем переменную для масштаба
        this.minScale = 0.5; // Минимальный масштаб
        this.maxScale = 2; // Максимальный масштаб
        
        // Bind methods
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleResize = this.handleResize.bind(this);
        this.gameLoop = this.gameLoop.bind(this);
        
        // Initialize event listeners
        this.initializeEventListeners();
        
        // Add test players
        this.addTestPlayers();
        
        // Set first player as active
        if (this.players.length > 0) {
            this.activePlayer = this.players[0];
        }
        
        // Add event listeners
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('wheel', (e) => this.handleMouseWheel(e)); // Добавляем обработчик колеса мыши
        
        // Start game loop
        this.lastTime = 0;
        this.animate(0);
    }
    
    resizeCanvas() {
        // Set canvas size to window size
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    handleResize() {
        this.resizeCanvas();
    }
    
    initializeEventListeners() {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('resize', this.handleResize);
    }
    
    handleKeyDown(e) {
        this.keys[e.key] = true;
        if (this.activePlayer) {
            this.activePlayer.handleKeyDown(e.key);
        }
    }
    
    handleKeyUp(e) {
        this.keys[e.key] = false;
        if (this.activePlayer) {
            this.activePlayer.handleKeyUp(e.key);
        }
    }
    
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const rawX = e.clientX - rect.left;
        const rawY = e.clientY - rect.top;
        
        // Store raw mouse position
        this.mouse.rawX = rawX;
        this.mouse.rawY = rawY;
        
        if (this.activePlayer) {
            // Calculate mouse position relative to active player
            this.mouse.x = (rawX - this.canvas.width / 2) / this.scale + this.activePlayer.x;
            this.mouse.y = (rawY - this.canvas.height / 2) / this.scale + this.activePlayer.y;
        }
    }
    
    handleMouseWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1; // Определяем направление прокрутки
        this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale + delta));
    }
    
    start() {
        if (!this.isGameRunning) {
            this.isGameRunning = true;
            this.gameLoop();
        }
    }
    
    stop() {
        this.isGameRunning = false;
    }
    
    update(deltaTime) {
        // Update game time
        if (this.gameTime > 0) {
            this.gameTime -= 1/60; // Assuming 60 FPS
        }
        
        // Update all players
        this.players.forEach(player => {
            player.update(this);
        });
    }
    
    render() {
        // Clear canvas with gray background
        this.ctx.fillStyle = '#333333';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.activePlayer) {
            // Save the current context state
            this.ctx.save();

            // Reset transformation matrix
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);

            // Translate to center of canvas
            this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
            
            // Apply scale
            this.ctx.scale(this.scale, this.scale);
            
            // Translate to follow active player
            this.ctx.translate(-this.activePlayer.x, -this.activePlayer.y);

            // Render map relative to active player
            this.map.render(this.ctx);

            // Render all players
            this.players.forEach(player => {
                this.ctx.save();
                this.ctx.translate(player.x, player.y);
                this.renderPlayer(player);
                this.ctx.restore();
            });

            // Restore the context state
            this.ctx.restore();

            // Draw crosshair at mouse position
            this.ctx.save();
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.arc(this.mouse.rawX, this.mouse.rawY, 10, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();
        }
        
        // Render game time
        this.renderGameTime();
    }
    
    renderPlayer(player) {
        this.ctx.save();
        this.ctx.rotate(player.angle);
        
        // Draw player body
        this.ctx.fillStyle = player.color;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 15, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Draw field of view
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.arc(0, 0, 100, -player.fieldOfView/2, player.fieldOfView/2);
        this.ctx.closePath();
        this.ctx.stroke();
        
        this.ctx.restore();
    }
    
    renderGameTime() {
        const minutes = Math.floor(this.gameTime / 60);
        const seconds = Math.floor(this.gameTime % 60);
        const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(timeString, this.canvas.width / 2, 30);
    }
    
    gameLoop() {
        if (!this.isGameRunning) return;
        
        this.update();
        this.render();
        
        requestAnimationFrame(this.gameLoop);
    }
    
    addPlayer(player) {
        this.players.push(player);
    }
    
    removePlayer(id) {
        this.players = this.players.filter(player => player.id !== id);
    }
    
    addTestPlayers() {
        // Helper function to find a valid spawn position
        const findValidSpawn = () => {
            let x, y;
            let attempts = 0;
            const maxAttempts = 100;
            
            do {
                // Generate random position within boundaries
                x = (Math.random() - 0.5) * 4000;
                y = (Math.random() - 0.5) * 4000;
                attempts++;
            } while ((!this.map.isPointInsideBoundaries(x, y) || 
                     this.map.checkCollision(x, y, 15).collides) && 
                     attempts < maxAttempts);

            return { x, y };
        };

        // Add a player
        const playerPos = findValidSpawn();
        const player = new Player(playerPos.x, playerPos.y, '#00f');
        this.players.push(player);
        this.activePlayer = player;

        // Add a hunter
        const hunterPos = findValidSpawn();
        const hunter = new Hunter(hunterPos.x, hunterPos.y, '#f00');
        this.players.push(hunter);

        // Add a predator
        const predatorPos = findValidSpawn();
        const predator = new Predator(predatorPos.x, predatorPos.y, '#0f0');
        this.players.push(predator);
    }

    animate(currentTime) {
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame((time) => this.animate(time));
    }
}

// Initialize and start the game
const game = new Game();
game.start(); 