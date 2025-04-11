export class Player {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.health = 100;
        this.speed = 5;
        this.angle = 0; // Angle in radians
        this.isAlive = true;
        this.fieldOfView = Math.PI / 2; // 90 degrees in radians
        
        // Movement state
        this.movement = {
            up: false,
            down: false,
            left: false,
            right: false
        };
    }

    update(game) {
        // Handle movement
        let dx = 0;
        let dy = 0;

        if (this.movement.up) dy -= 1;
        if (this.movement.down) dy += 1;
        if (this.movement.left) dx -= 1;
        if (this.movement.right) dx += 1;

        // Normalize diagonal movement
        if (dx !== 0 && dy !== 0) {
            const length = Math.sqrt(dx * dx + dy * dy);
            dx /= length;
            dy /= length;
        }

        // Calculate new position
        const newX = this.x + dx * this.speed;
        const newY = this.y + dy * this.speed;

        // Check for collision
        const collision = game.map.checkCollision(newX, newY, 15);
        
        if (!collision.collides) {
            // No collision, move normally
            this.x = newX;
            this.y = newY;
        } else {
            // Collision detected, calculate sliding vector
            const dot = dx * collision.normal.x + dy * collision.normal.y;
            
            // Project movement vector onto wall normal
            const slideX = dx - dot * collision.normal.x;
            const slideY = dy - dot * collision.normal.y;
            
            // Try to move along the wall
            const slideLength = Math.sqrt(slideX * slideX + slideY * slideY);
            if (slideLength > 0) {
                const normalizedSlideX = slideX / slideLength;
                const normalizedSlideY = slideY / slideLength;
                
                // Try to move in the sliding direction
                const slideNewX = this.x + normalizedSlideX * this.speed;
                const slideNewY = this.y + normalizedSlideY * this.speed;
                
                if (!game.map.checkCollision(slideNewX, slideNewY, 15).collides) {
                    this.x = slideNewX;
                    this.y = slideNewY;
                }
            }
        }

        // Update angle based on mouse position
        const dxMouse = game.mouse.rawX - game.canvas.width / 2;
        const dyMouse = game.mouse.rawY - game.canvas.height / 2;
        this.angle = Math.atan2(dyMouse, dxMouse);
    }

    handleKeyDown(key) {
        // Handle WASD keys regardless of keyboard layout
        switch (key.toLowerCase()) {
            case 'w':
            case 'ц':
                this.movement.up = true;
                break;
            case 's':
            case 'ы':
                this.movement.down = true;
                break;
            case 'a':
            case 'ф':
                this.movement.left = true;
                break;
            case 'd':
            case 'в':
                this.movement.right = true;
                break;
        }
    }

    handleKeyUp(key) {
        // Handle WASD keys regardless of keyboard layout
        switch (key.toLowerCase()) {
            case 'w':
            case 'ц':
                this.movement.up = false;
                break;
            case 's':
            case 'ы':
                this.movement.down = false;
                break;
            case 'a':
            case 'ф':
                this.movement.left = false;
                break;
            case 'd':
            case 'в':
                this.movement.right = false;
                break;
        }
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            this.isAlive = false;
        }
    }
}

class Hunter extends Player {
    constructor(x, y, color) {
        super(x, y, color);
        this.role = 'hunter';
        this.ammo = 30;
        this.reloadTime = 2; // seconds
        this.isReloading = false;
    }

    shoot() {
        if (this.ammo > 0 && !this.isReloading) {
            this.ammo--;
            return true;
        }
        return false;
    }

    reload() {
        if (!this.isReloading) {
            this.isReloading = true;
            setTimeout(() => {
                this.ammo = 30;
                this.isReloading = false;
            }, this.reloadTime * 1000);
        }
    }
}

class Predator extends Player {
    constructor(x, y, color) {
        super(x, y, color);
        this.role = 'predator';
        this.speed = 7; // Predator is faster than hunters
        this.health = 150; // Predator has more health
    }

    // Predator-specific abilities can be added here
    // For example: special movement abilities, vision modifiers, etc.
} 