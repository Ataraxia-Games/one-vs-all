/**
 * Checks collision between a circle and a rotated rectangle (representing a wall).
 * @param {object} circle - Circle object { x, y, radius }
 * @param {object} wall - Wall object { x, y, length, width, angle }
 * @returns {boolean} - True if collision occurs, false otherwise.
 */
export function checkCircleWallCollision(circle, wall) {
    // 1. Transform circle center to wall's local coordinate system
    const dx = circle.x - wall.x;
    const dy = circle.y - wall.y;
    const cosAngle = Math.cos(-wall.angle);
    const sinAngle = Math.sin(-wall.angle);

    const localCircleX = dx * cosAngle - dy * sinAngle;
    const localCircleY = dx * sinAngle + dy * cosAngle;

    // 2. Find the closest point on the (non-rotated) wall rectangle to the transformed circle center
    const halfLength = wall.length / 2;
    const halfWidth = wall.width / 2;

    const closestX = Math.max(-halfLength, Math.min(localCircleX, halfLength));
    const closestY = Math.max(-halfWidth, Math.min(localCircleY, halfWidth));

    // 3. Calculate the distance between the circle center and this closest point
    const distX = localCircleX - closestX;
    const distY = localCircleY - closestY;
    const distanceSquared = (distX * distX) + (distY * distY);

    // 4. Check if the distance is less than the circle's radius squared
    return distanceSquared < (circle.radius * circle.radius);
} 