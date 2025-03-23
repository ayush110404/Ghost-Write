import { getPixelData, generateBrushMask } from './canvas-util';
import { COLOR_SIGMA, SMOOTHING_KERNEL_SIZE } from './constants';

/**
 * Apply eraser tool at a specific position
 */
export const applyEraser = (x:number, y:number, context:CanvasRenderingContext2D | null, originalImageData:ImageData | null, brushMask:any[] | null, brushSize:number) => {
  if (!context || !originalImageData || !brushMask) return;

  const canvas = context.canvas;
  const radius = Math.floor(brushSize / 2);
  const diameter = 2 * radius + 1;
  const width = canvas.width;
  const height = canvas.height;

  const currentImageData = context.getImageData(0, 0, width, height);
  const data = currentImageData.data;

  for (let i = -radius; i <= radius; i++) {
    for (let j = -radius; j <= radius; j++) {
      const maskIndex = (i + radius) * diameter + (j + radius);
      const isInsideBrush = brushMask[maskIndex];
      
      if (isInsideBrush) {
        const pixelX = Math.round(x + j);
        const pixelY = Math.round(y + i);

        if (pixelX >= 0 && pixelX < width && pixelY >= 0 && pixelY < height) {
          const pixelIndex = (pixelY * width + pixelX) * 4;
          const origPixel = getPixelData(originalImageData, pixelX, pixelY);

          data[pixelIndex] = origPixel.r;
          data[pixelIndex + 1] = origPixel.g;
          data[pixelIndex + 2] = origPixel.b;
        }
      }
    }
  }

  context.putImageData(currentImageData, 0, 0);
  
  return { x, y, radius, type: 'eraser' };
};

/**
 * Apply magic brush effect to a position
 */
export const applyMagicBrush = (x:number, y:number, context:CanvasRenderingContext2D, origImgData:ImageData|undefined, currentImgData:ImageData, brushSize:number, brushMask:any[]|null) => {
    if (!context || !origImgData) return;
  
    const canvas = context.canvas;
    const radius = Math.floor(brushSize / 2);
    const diameter = 2 * radius + 1;
    const width = canvas.width;
    const height = canvas.height;
  
    // Generate brush mask if not provided
    const actualBrushMask = brushMask || generateBrushMask(brushSize);
  
    const data = currentImgData.data;
    const origData = origImgData.data;
  
    // Reference pixel at the brush center for color similarity comparisons
    const centerPixelIndex = (Math.round(y) * width + Math.round(x)) * 4;
    const centerColor = {
      r: origData[centerPixelIndex],
      g: origData[centerPixelIndex + 1],
      b: origData[centerPixelIndex + 2]
    };
  
    // Create a color lookup map for faster processing
    const colorMap = new Map();
    const searchRadius = Math.round(brushSize * 2);
    const numSearchSamples = 25;
  
    // Pre-sample colors from a wider area around the brush center
    for (let k = 0; k < numSearchSamples; k++) {
      const angle = (k / numSearchSamples) * Math.PI * 2 + (Math.random() * 0.2);
      const distance = (Math.random() * 0.8 + 0.2) * searchRadius;
      const sampleX = Math.round(x + Math.cos(angle) * distance);
      const sampleY = Math.round(y + Math.sin(angle) * distance);
  
      if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) {
        continue;
      }
  
      const sampleIndex = (sampleY * width + sampleX) * 4;
      
      // Calculate color similarity to center pixel
      const colorSimilarity = 
        Math.abs(origData[sampleIndex] - centerColor.r) +
        Math.abs(origData[sampleIndex + 1] - centerColor.g) +
        Math.abs(origData[sampleIndex + 2] - centerColor.b);
      
      // Store this color in our map
      colorMap.set(k, {
        r: data[sampleIndex],
        g: data[sampleIndex + 1],
        b: data[sampleIndex + 2],
        similarity: colorSimilarity
      });
    }
  
    // Sort colors by similarity to improve selection quality
    const sortedColors = Array.from(colorMap.values())
      .sort((a, b) => a.similarity - b.similarity)
      .slice(0, 10); // Take top 10 similar colors
    
    // Process brush area with coherent patch-based sampling
    for (let i = -radius; i <= radius; i++) {
      for (let j = -radius; j <= radius; j++) {
        const maskIndex = (i + radius) * diameter + (j + radius);
        const blendFactor = actualBrushMask[maskIndex];
        if (blendFactor === 0) continue;
  
        const pixelX = Math.round(x + j);
        const pixelY = Math.round(y + i);
  
        if (pixelX < 0 || pixelX >= width || pixelY < 0 || pixelY >= height) {
          continue;
        }
  
        const pixelIndex = (pixelY * width + pixelX) * 4;
  
        // Calculate weighted average of similar colors
        let totalWeight = 0;
        let weightedR = 0, weightedG = 0, weightedB = 0;
  
        for (const color of sortedColors) {
          const weight = 1 / (color.similarity + 1);
          totalWeight += weight;
          
          weightedR += color.r * weight;
          weightedG += color.g * weight;
          weightedB += color.b * weight;
        }
  
        // Apply weighted color average
        if (totalWeight > 0) {
          data[pixelIndex] = Math.round(weightedR / totalWeight);
          data[pixelIndex + 1] = Math.round(weightedG / totalWeight);
          data[pixelIndex + 2] = Math.round(weightedB / totalWeight);
        }
      }
    }
  };

/**
 * Apply edge-preserving bilateral smoothing filter to a specific region
 */
export const applyFinalSmoothing = (x1:number, y1:number, x2:number, y2:number, imageData:ImageData, context:CanvasRenderingContext2D) => {
  if (!context) return;
  
  const canvas = context.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  const data = imageData.data;
  
  const radius = Math.floor(SMOOTHING_KERNEL_SIZE / 2);
  
  // Create a temporary buffer to avoid artifacts from processing in-place
  const tempData = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i++) {
    tempData[i] = data[i];
  }
  
  // Apply bilateral filter for edge-preserving smoothing
  const padding = 10;
  for (let y = Math.max(radius, y1 - padding); y <= Math.min(height - radius - 1, y2 + padding); y++) {
    for (let x = Math.max(radius, x1 - padding); x <= Math.min(width - radius - 1, x2 + padding); x++) {
      const pixelIndex = (y * width + x) * 4;
      
      let sumR = 0, sumG = 0, sumB = 0;
      let totalWeight = 0;
      
      // Base color for similarity comparison
      const centerR = data[pixelIndex];
      const centerG = data[pixelIndex + 1];
      const centerB = data[pixelIndex + 2];
      
      // Bilateral filter - blend based on both spatial distance and color similarity
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          
          // Skip if out of bounds
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          
          const neighborIndex = (ny * width + nx) * 4;
          
          // Spatial weight (distance from center)
          const spatialDist = dx * dx + dy * dy;
          const spatialWeight = Math.exp(-spatialDist / (2 * radius * radius));
          
          // Color similarity weight
          const colorDist = 
            Math.pow(data[neighborIndex] - centerR, 2) +
            Math.pow(data[neighborIndex + 1] - centerG, 2) +
            Math.pow(data[neighborIndex + 2] - centerB, 2);
          const colorSimilarity = Math.exp(-colorDist / (2 * COLOR_SIGMA * COLOR_SIGMA));
          
          // Combined weight
          const weight = spatialWeight * colorSimilarity;
          
          sumR += data[neighborIndex] * weight;
          sumG += data[neighborIndex + 1] * weight;
          sumB += data[neighborIndex + 2] * weight;
          totalWeight += weight;
        }
      }
      
      // Apply weighted average
      if (totalWeight > 0) {
        tempData[pixelIndex] = Math.round(sumR / totalWeight);
        tempData[pixelIndex + 1] = Math.round(sumG / totalWeight);
        tempData[pixelIndex + 2] = Math.round(sumB / totalWeight);
      }
    }
  }
  
  // Copy back to original data
  for (let y = Math.max(0, y1 - padding); y <= Math.min(height - 1, y2 + padding); y++) {
    for (let x = Math.max(0, x1 - padding); x <= Math.min(width - 1, x2 + padding); x++) {
      const pixelIndex = (y * width + x) * 4;
      data[pixelIndex] = tempData[pixelIndex];
      data[pixelIndex + 1] = tempData[pixelIndex + 1];
      data[pixelIndex + 2] = tempData[pixelIndex + 2];
    }
  }
};

/**
 * Process a selected area with the magic brush
 */
export const applyMagicBrushToArea = async (
  {areaStart, 
  areaEnd, 
  context,
  originalImageData,
  tempImageData,
  brushSize,
  onProgressUpdate,
  onComplete}: {
    areaStart: {x:number, y:number},
    areaEnd: {x:number, y:number},
    context:CanvasRenderingContext2D | null,
    originalImageData:ImageData | undefined,
    tempImageData:ImageData | null,
    brushSize:number,
    onProgressUpdate:{(progress:number):void},
    onComplete:{(areaInfo:any):void}
  }
) => {
  if (!context || !areaStart || !areaEnd || !originalImageData) {
    console.error("Missing required parameters for applyMagicBrushToArea");
    return;
  }

  onProgressUpdate(0);

  const x1 = Math.min(areaStart.x, areaEnd.x);
  const y1 = Math.min(areaStart.y, areaEnd.y);
  const x2 = Math.max(areaStart.x, areaEnd.x);
  const y2 = Math.max(areaStart.y, areaEnd.y);
  
  // Restore the clean image before processing (remove selection rectangle)
  if (tempImageData) {
    context.putImageData(tempImageData, 0, 0);
  }
  
  // Get current image data once
  const canvas = context.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  const currentImageData = context.getImageData(0, 0, width, height);
  
  // Generate brush mask once (reused for all points)
  const brushMask = generateBrushMask(brushSize);
  
  // Calculate grid size for processing
  const gridSize = Math.max(Math.floor(brushSize / 3), 5);
  
  // Create points array with calculated spacing
  const points:any = [];
  for (let y = y1; y <= y2; y += gridSize) {
    for (let x = x1; x <= x2; x += gridSize) {
      points.push({ x, y });
    }
  }
  
  // Process in smaller chunks
  const totalChunks = Math.ceil(points.length / 100);
  let currentChunk = 0;
  
  const processNextChunk = () => {
    return new Promise<void>(resolve => {
      // Calculate indices for this chunk
      const startIdx = currentChunk * 100;
      const endIdx = Math.min(startIdx + 100, points.length);
      
      // Process this chunk of points
      for (let i = startIdx; i < endIdx; i++) {
        const point = points[i];
        applyMagicBrush(
          point.x, 
          point.y, 
          context, 
          originalImageData, 
          currentImageData, 
          brushSize, 
          brushMask
        );
      }
      
      // Update the canvas with the changes
      context.putImageData(currentImageData, 0, 0);
      
      // Update progress
      currentChunk++;
      const progress = Math.min(100, Math.round((currentChunk / totalChunks) * 100));
      onProgressUpdate(progress);
      
      // Resolve promise
      resolve();
    });
  };
  
  const processChunksSequentially = async () => {
    while (currentChunk < totalChunks) {
      await processNextChunk();
      // Small delay to allow UI updates
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  };
  
  try {
    // Start processing chunks
    await processChunksSequentially();
    
    // Apply final smoothing
    applyFinalSmoothing(x1, y1, x2, y2, currentImageData, context);
    
    // Update the canvas one last time
    context.putImageData(currentImageData, 0, 0);
    
    // Call completion callback with area info
    onComplete({ 
      x: x1, 
      y: y1, 
      x2: x2, 
      y2: y2, 
      type: 'area-magic-brush' 
    });
  } catch (error) {
    console.error("Error processing area with magic brush:", error);
    onProgressUpdate(0);
  }
};