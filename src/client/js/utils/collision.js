/**
 * Checks collision between a circle and a rotated rectangle (wall).
 * Returns collision details if occurred.
 * @param {object} circle - Circle object { x, y, radius }
 * @param {object} wall - Wall object { x, y, length, width, angle }
 * @returns {object} - { collided: boolean, overlap?: number, pushX?: number, pushY?: number }
 */
export function checkCircleWallCollision(circle, wall) {
    // 1. Transform circle center to wall's local coordinate system
    const dx = circle.x - wall.x;
    const dy = circle.y - wall.y;
    const cosAngle = Math.cos(-wall.angle);
    const sinAngle = Math.sin(-wall.angle);
    const localCircleX = dx * cosAngle - dy * sinAngle;
    const localCircleY = dx * sinAngle + dy * cosAngle;

    // 2. Find the closest point on the (non-rotated) wall rectangle
    const halfLength = wall.length / 2;
    const halfWidth = wall.width / 2;
    const closestX = Math.max(-halfLength, Math.min(localCircleX, halfLength));
    const closestY = Math.max(-halfWidth, Math.min(localCircleY, halfWidth));

    // 3. Calculate distance squared
    const distX = localCircleX - closestX;
    const distY = localCircleY - closestY;
    const distanceSquared = (distX * distX) + (distY * distY);

    // 4. Check collision and calculate push vector if needed
    const radiusSquared = circle.radius * circle.radius;
    if (distanceSquared < radiusSquared && distanceSquared > 1e-9) { // Added epsilon to avoid division by zero
        const distance = Math.sqrt(distanceSquared);
        const overlap = circle.radius - distance;
        
        // Normalized push vector in local coordinates (away from closest point)
        const pushVecLocalX = distX / distance;
        const pushVecLocalY = distY / distance;
        
        // Rotate push vector back to world coordinates (use original wall angle)
        const cosAngleWall = Math.cos(wall.angle);
        const sinAngleWall = Math.sin(wall.angle);
        const pushVecWorldX = pushVecLocalX * cosAngleWall - pushVecLocalY * sinAngleWall;
        const pushVecWorldY = pushVecLocalX * sinAngleWall + pushVecLocalY * cosAngleWall;

        return {
            collided: true,
            overlap: overlap,
            pushX: pushVecWorldX, // Normalized push direction
            pushY: pushVecWorldY
        };
    } else if (distanceSquared <= 1e-9 && radiusSquared > 0) {
        // Special case: Center is exactly on the closest point (or very close)
        // Push away based on relative position to wall center (approximate)
        const approxPushX = dx / (Math.sqrt(dx*dx + dy*dy) || 1); // Normalize vector from wall center to circle center
        const approxPushY = dy / (Math.sqrt(dx*dx + dy*dy) || 1);
         return {
            collided: true,
            overlap: circle.radius, // Max overlap
            pushX: approxPushX, 
            pushY: approxPushY
        };
    }

    return { collided: false };
} 