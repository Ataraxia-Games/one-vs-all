import { Player } from './player.js';

export class Predator extends Player {
    constructor(x, y, id) {
        super(x, y, id);
        this.role = 'predator';
        this.speed = 7; // Predator is faster than hunters
        this.health = 150; // Predator has more health
    }

    // Predator-specific abilities can be added here
    // For example: special movement abilities, vision modifiers, etc.
} 