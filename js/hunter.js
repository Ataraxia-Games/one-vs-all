import { Player } from './player.js';

export class Hunter extends Player {
    constructor(x, y, id) {
        super(x, y, id);
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