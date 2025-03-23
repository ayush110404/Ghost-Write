/**
 * Get pixel data from ImageData at a specific coordinate
 */
export const getPixelData = (imageData: ImageData, x: number, y: number) => {
    const index = (y * imageData.width + x) * 4;
    return {
        r: imageData.data[index],
        g: imageData.data[index + 1],
        b: imageData.data[index + 2],
        a: imageData.data[index + 3],
        index
    };
};

/**
 * Extract coordinates from a mouse or touch event relative to canvas
 */
export const getEventCoordinates = (event: any, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (event.touches) {
        return {
            x: (event.touches[0].clientX - rect.left) * scaleX,
            y: (event.touches[0].clientY - rect.top) * scaleY,
        };
    } else {
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY,
        };
    }
};

/**
* Generate a brush mask (intensity map) for the given brush size
*/
export const generateBrushMask = (brushSize: number) => {
    const radius = Math.floor(brushSize / 2);
    const diameter = 2 * radius + 1;
    const mask = new Array(diameter * diameter);

    for (let i = -radius; i <= radius; i++) {
        for (let j = -radius; j <= radius; j++) {
            const distance = Math.sqrt(i * i + j * j);
            const index = (i + radius) * diameter + (j + radius);
            mask[index] = distance > radius ? 0 : 1;
        }
    }

    return mask;
};