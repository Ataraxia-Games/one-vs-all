export class InputHandler {
    constructor() {
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false
        };
        this.isShiftDown = false; // Состояние Shift
        // Store raw screen coordinates
        this.rawMouseX = undefined;
        this.rawMouseY = undefined;
        this.wheelDelta = 0; // Store wheel delta
        this.isRightMouseDown = false; // Состояние ПКМ
        this.isLeftMouseClick = false; // Флаг для одиночного клика ЛКМ

        // Keyboard event listeners
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // Mouse event listeners
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        // Wheel event listener - explicitly set passive to false
        window.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        window.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mouseup', (e) => this.handleMouseUp(e));

        // Disable Context Menu
        window.addEventListener('contextmenu', (e) => e.preventDefault());
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
            case 'ShiftLeft': 
            case 'ShiftRight': 
                this.isShiftDown = true; 
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
            case 'ShiftLeft': 
            case 'ShiftRight': 
                this.isShiftDown = false; 
                break;
        }
    }

    handleMouseMove(e) {
        this.rawMouseX = e.clientX;
        this.rawMouseY = e.clientY;
    }

    handleWheel(e) {
        // Accumulate wheel delta (positive for scroll down/zoom out, negative for scroll up/zoom in)
        this.wheelDelta += e.deltaY;
        // Prevent page scrolling
        e.preventDefault(); 
    }

    handleMouseDown(e) {
        if (e.button === 0) { // Левая кнопка мыши
            this.isLeftMouseClick = true; // Устанавливаем флаг клика
        }
        if (e.button === 2) { // Правая кнопка мыши
            this.isRightMouseDown = true;
        }
    }

    handleMouseUp(e) {
        // Сбрасываем флаг зажатия ПКМ
        if (e.button === 2) { 
            this.isRightMouseDown = false;
        }
        // Примечание: isLeftMouseClick сбрасывается в getInput
    }

    getInput() {
        const currentWheelDelta = this.wheelDelta;
        this.wheelDelta = 0; 
        const currentLeftMouseClick = this.isLeftMouseClick;
        this.isLeftMouseClick = false; // Сбрасываем флаг клика ПОСЛЕ чтения

        return {
            keys: { ...this.keys },
            isShiftDown: this.isShiftDown, // Передаем состояние Shift
            rawMouseX: this.rawMouseX,
            rawMouseY: this.rawMouseY,
            wheelDelta: currentWheelDelta,
            isRightMouseDown: this.isRightMouseDown,
            isLeftMouseClick: currentLeftMouseClick // Передаем флаг клика
        };
    }
} 