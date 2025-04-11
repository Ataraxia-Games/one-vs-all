export class InputHandler {
    constructor() {
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false
        };
        this.mouse = {
            x: undefined,
            y: undefined
        };

        // Keyboard event listeners
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // Mouse event listeners
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    }

    handleKeyDown(e) {
        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.w = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.a = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.s = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.d = true;
                break;
        }
    }

    handleKeyUp(e) {
        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.w = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.a = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.s = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.d = false;
                break;
        }
    }

    handleMouseMove(e) {
        // Store raw screen coordinates
        this.rawMouseX = e.clientX;
        this.rawMouseY = e.clientY;
    }

    getInput(cameraX = 0, cameraY = 0) {
        // Calculate world mouse coordinates
        const worldMouseX = this.rawMouseX - cameraX;
        const worldMouseY = this.rawMouseY - cameraY;

        return {
            keys: { ...this.keys },
            mouse: { x: worldMouseX, y: worldMouseY }
        };
    }
} 