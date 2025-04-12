/**
 * Finds the intersection point of two line segments.
 * Adapted from: http://www.jeffreythompson.org/collision-detection/line-line.php
 * @param {number} x1 - Start x of segment 1
 * @param {number} y1 - Start y of segment 1
 * @param {number} x2 - End x of segment 1
 * @param {number} y2 - End y of segment 1
 * @param {number} x3 - Start x of segment 2
 * @param {number} y3 - Start y of segment 2
 * @param {number} x4 - End x of segment 2
 * @param {number} y4 - End y of segment 2
 * @returns {object|null} - Intersection point { x, y } or null if no intersection.
 */
export function intersectSegments(x1, y1, x2, y2, x3, y3, x4, y4) {

    // Calculate the denominator
    const den = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);

    // Check if lines are parallel (denominator is zero)
    if (den === 0) {
        return null;
    }

    // Calculate the numerators for parameters t and u
    const tNum = (x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3);
    const uNum = (x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3);

    // Calculate parameters t and u
    const t = tNum / den;
    const u = uNum / den;

    // Check if the intersection point lies within both segments
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        const intersectionX = x1 + t * (x2 - x1);
        const intersectionY = y1 + t * (y2 - y1);
        return { x: intersectionX, y: intersectionY };
    }

    // No intersection within the segments
    return null;
} 