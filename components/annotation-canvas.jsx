'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { debounce } from 'lodash';

export default function AnnotationCanvas({ imageUrl, onSave }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [context, setContext] = useState(null);
  const [tool, setTool] = useState('area-magic-brush'); // 'area-magic-brush', 'eraser', 'pen'
  const [brushSize, setBrushSize] = useState(20);
  const [originalImageData, setOriginalImageData] = useState(null);
  const [annotatedAreas, setAnnotatedAreas] = useState([]);
  const [brushMask, setBrushMask] = useState(null);
  const [isErasing, setIsErasing] = useState(false);
  const [areaStart, setAreaStart] = useState(null);
  const [areaEnd, setAreaEnd] = useState(null);
  const [isProcessingArea, setIsProcessingArea] = useState(false);
  const [tempImageData, setTempImageData] = useState(null);
  const [processingProgress, setProcessingProgress] = useState(0);

  // Initialize brush mask when brush size changes
  useEffect(() => {
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
    setBrushMask(mask);
  }, [brushSize]);

  // Initialize canvas when image is loaded
  useEffect(() => {
    if (!imageUrl) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    setContext(ctx);

    const image = new Image();
    image.onload = () => {
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);
      setOriginalImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    image.src = imageUrl;
  }, [imageUrl]);

  const getPixelData = (imageData, x, y) => {
    const index = (y * imageData.width + x) * 4;
    return {
      r: imageData.data[index],
      g: imageData.data[index + 1],
      b: imageData.data[index + 2],
      a: imageData.data[index + 3],
      index: index,
    };
  };

  const applyEraser = (x, y) => {
    if (!context || !originalImageData || !brushMask) return;

    const canvas = canvasRef.current;
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
    setAnnotatedAreas(areas => [...areas, { x, y, radius: Math.floor(brushSize / 2), type: 'eraser' }]);
  };

  // Replace the existing applyMagicBrushOptimized function with this improved version
const applyMagicBrushOptimized = (x, y, currentContext, origImgData, currentImgData) => {
  if (!currentContext || !origImgData || !brushMask) return;

  const canvas = canvasRef.current;
  const radius = Math.floor(brushSize / 2);
  const diameter = 2 * radius + 1;
  const width = canvas.width;
  const height = canvas.height;

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
  const searchRadius = Math.round(brushSize * 2); // Increase search radius for better sampling
  const numSearchSamples = 25; // Increase samples for better color averaging

  // Pre-sample colors from a wider area around the brush center
  for (let k = 0; k < numSearchSamples; k++) {
    // Use structured sampling with some randomness for better coverage
    const angle = (k / numSearchSamples) * Math.PI * 2 + (Math.random() * 0.2);
    const distance = (Math.random() * 0.8 + 0.2) * searchRadius; // Ensure good distribution
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
      const blendFactor = brushMask[maskIndex];
      if (blendFactor === 0) continue;

      const pixelX = Math.round(x + j);
      const pixelY = Math.round(y + i);

      if (pixelX < 0 || pixelX >= width || pixelY < 0 || pixelY >= height) {
        continue;
      }

      const pixelIndex = (pixelY * width + pixelX) * 4;
      const currentPixelColor = {
        r: origData[pixelIndex],
        g: origData[pixelIndex + 1],
        b: origData[pixelIndex + 2]
      };

      // Spatial coherence - similar pixels should get similar colors
      // Weight closer colors higher for more coherent appearance
      let totalWeight = 0;
      let weightedR = 0, weightedG = 0, weightedB = 0;

      // Calculate distance-based weighted average of similar colors
      for (const color of sortedColors) {
        // Inverse similarity as weight - closer colors get higher weights
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



  const debouncedApplyEraser = useCallback(
    debounce((x, y) => {
      applyEraser(x, y);
    }, 10),
    [context, originalImageData, brushSize, brushMask]
  );

  const startDrawing = (e) => {
    e.preventDefault(); // Prevent default behavior
    setIsDrawing(true);
    const { offsetX, offsetY } = getCoordinates(e);

    if (isErasing) {
      debouncedApplyEraser(offsetX, offsetY);
    } else if (tool === 'pen') {
      context.beginPath();
      context.moveTo(offsetX, offsetY);
    } else if (tool === 'area-magic-brush') {
      // Save the current canvas state for drawing rectangles
      if (context) {
        setTempImageData(context.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height));
        setAreaStart({ x: offsetX, y: offsetY });
        setAreaEnd({ x: offsetX, y: offsetY });
      }
    }
  };

  const draw = (e) => {
    e.preventDefault(); // Prevent default behavior
    if (!isDrawing) return;

    const { offsetX, offsetY } = getCoordinates(e);

    if (isErasing) {
      debouncedApplyEraser(offsetX, offsetY);
    } else if (tool === 'pen') {
      context.lineTo(offsetX, offsetY);
      context.stroke();
    } else if (tool === 'area-magic-brush' && tempImageData) {
      // Update the end point and redraw the selection rectangle
      setAreaEnd({ x: offsetX, y: offsetY });
      drawSelectionRect();
    }
  };

  const drawSelectionRect = () => {
    if (!context || !tempImageData || !areaStart || !areaEnd) return;

    // Restore the original image state
    context.putImageData(tempImageData, 0, 0);

    // Draw selection rectangle
    context.save();
    context.strokeStyle = '#00ff00';
    context.lineWidth = 2;
    context.setLineDash([5, 5]);
    
    const x = Math.min(areaStart.x, areaEnd.x);
    const y = Math.min(areaStart.y, areaEnd.y);
    const width = Math.abs(areaEnd.x - areaStart.x);
    const height = Math.abs(areaEnd.y - areaStart.y);
    
    context.strokeRect(x, y, width, height);
    context.restore();
  };

  // Optimized area processing to prevent memory issues
  const applyMagicBrushToArea = () => {
    if (!context || !areaStart || !areaEnd || isProcessingArea) return;
  
    setIsProcessingArea(true);
    setProcessingProgress(0);
  
    const x1 = Math.min(areaStart.x, areaEnd.x);
    const y1 = Math.min(areaStart.y, areaEnd.y);
    const x2 = Math.max(areaStart.x, areaEnd.x);
    const y2 = Math.max(areaStart.y, areaEnd.y);
    
    // Restore the clean image before processing (remove selection rectangle)
    if (tempImageData) {
      context.putImageData(tempImageData, 0, 0);
    }
    
    // Get the current image data once to avoid repeatedly calling getImageData
    const canvas = canvasRef.current;
    const width = canvas.width;
    const height = canvas.height;
    
    const currentImageData = context.getImageData(0, 0, width, height);
    
    // Calculate a sensible grid size for processing - larger brush requires fewer samples
    // This is crucial for memory optimization
    const gridSize = Math.max(Math.floor(brushSize / 3), 5);
    
    // Create points array with calculated spacing
    const points = [];
    
    // Add grid points
    for (let y = y1; y <= y2; y += gridSize) {
      for (let x = x1; x <= x2; x += gridSize) {
        points.push({ x, y });
      }
    }
    
    // Process in smaller chunks to prevent memory issues
    const chunkSize = 100; // Process 100 points at a time
    const totalChunks = Math.ceil(points.length / chunkSize);
    let currentChunk = 0;
    
    const processNextChunk = () => {
      // If we've processed all chunks, finish up
      if (currentChunk >= totalChunks) {
        finalizeProcessing();
        return;
      }
      
      // Calculate the start and end indices for this chunk
      const startIdx = currentChunk * chunkSize;
      const endIdx = Math.min(startIdx + chunkSize, points.length);
      
      // Process this chunk of points
      for (let i = startIdx; i < endIdx; i++) {
        const point = points[i];
        applyMagicBrushOptimized(point.x, point.y, context, originalImageData, currentImageData);
      }
      
      // Update the canvas with the changes
      context.putImageData(currentImageData, 0, 0);
      
      // Update progress
      currentChunk++;
      const progress = Math.min(100, Math.round((currentChunk / totalChunks) * 100));
      setProcessingProgress(progress);
      
      // Schedule the next chunk with a small delay to allow UI updates
      setTimeout(processNextChunk, 0);
    };
    
    const finalizeProcessing = () => {
      // Apply a light final smoothing if needed
      applyFinalSmoothing(x1, y1, x2, y2, currentImageData);
      
      // Update the canvas one last time
      context.putImageData(currentImageData, 0, 0);
      
      // Reset state
      setIsProcessingArea(false);
      setAreaStart(null);
      setAreaEnd(null);
      setTempImageData(null);
      setProcessingProgress(0);
      
      // Add to annotated areas
      setAnnotatedAreas(areas => [...areas, { 
        x1, y1, x2, y2, 
        type: 'area-magic-brush' 
      }]);
    };
    
    // Start processing
    processNextChunk();
  };
  
  // Improved and optimized final smoothing pass
  // Enhance final smoothing for better results
const applyFinalSmoothing = (x1, y1, x2, y2, imageData) => {
  if (!context) return;
  
  const canvas = canvasRef.current;
  const width = canvas.width;
  const height = canvas.height;
  
  const data = imageData.data;
  
  // Use a slightly larger kernel for smoother results
  const kernelSize = 5;
  const radius = Math.floor(kernelSize / 2);
  
  // Create a temporary buffer to avoid artifacts from processing in-place
  const tempData = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i++) {
    tempData[i] = data[i];
  }
  
  // Improved bilateral filtering for edge-preserving smoothing
  // Process entire area with a small boundary extension
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
          const colorSimilarity = Math.exp(-colorDist / (2 * 150 * 150)); // Color sigma = 150
          
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
  
  // Helper function to smooth a single pixel
  const smoothPixel = (x, y, data, width, radius) => {
    const pixelIndex = (y * width + x) * 4;
    let sumR = 0, sumG = 0, sumB = 0, count = 0;
    
    // Simple box blur
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        const neighborIndex = (ny * width + nx) * 4;
        
        sumR += data[neighborIndex];
        sumG += data[neighborIndex + 1];
        sumB += data[neighborIndex + 2];
        count++;
      }
    }
    
    // Apply smoothed value
    data[pixelIndex] = Math.round(sumR / count);
    data[pixelIndex + 1] = Math.round(sumG / count);
    data[pixelIndex + 2] = Math.round(sumB / count);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    
    if (tool === 'pen') {
      context.closePath();
    } else if (tool === 'area-magic-brush' && areaStart && areaEnd) {
      // Don't automatically apply - let user click the Apply button
    }
    
    setIsDrawing(false);
  };

  // Helper function to get coordinates from both mouse and touch events
  const getCoordinates = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (event.touches) {
      // Touch event
      return {
        offsetX: (event.touches[0].clientX - rect.left) * scaleX,
        offsetY: (event.touches[0].clientY - rect.top) * scaleY,
      };
    } else {
      // Mouse event
      return {
        offsetX: (event.clientX - rect.left) * scaleX,
        offsetY: (event.clientY - rect.top) * scaleY,
      };
    }
  };

  // Handle tool change
  const handleToolChange = (newTool) => {
    setTool(newTool);
    setAreaStart(null);
    setAreaEnd(null);
    setTempImageData(null);
    setIsErasing(false);
  };

  // Handle erase mode toggle
  const handleEraseToggle = () => {
    setIsErasing(!isErasing);
    setTool('eraser');
    setAreaStart(null);
    setAreaEnd(null);
    setTempImageData(null);
  };

  // Save the annotated image
  const handleSave = () => {
    if (!canvasRef.current) return;

    const imageData = canvasRef.current.toDataURL('image/png');
    onSave(imageData, annotatedAreas);
  };

  // Apply to selected area manually
  const handleApplyToArea = () => {
    if (areaStart && areaEnd && !isProcessingArea) {
      applyMagicBrushToArea();
    }
  };

  // Cancel area selection
  const handleCancelArea = () => {
    if (tempImageData && context) {
      context.putImageData(tempImageData, 0, 0);
    }
    setAreaStart(null);
    setAreaEnd(null);
    setTempImageData(null);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          className={`px-3 py-2 rounded ${tool === 'area-magic-brush' && !isErasing ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          onClick={() => handleToolChange('area-magic-brush')}
        >
          Area Magic Brush
        </button>
        <button
          className={`px-3 py-2 rounded ${isErasing ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
          onClick={handleEraseToggle}
        >
          {isErasing ? 'Stop Erasing' : 'Erase'}
        </button>
        <button
          className={`px-3 py-2 rounded ${tool === 'pen' && !isErasing ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          onClick={() => handleToolChange('pen')}
        >
          Pen
        </button>
        <div className="flex items-center">
          <span className="mr-2">Size:</span>
          <input
            type="range"
            min="5"
            max="50"
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
            className="w-32"
          />
          <span className="ml-2">{brushSize}px</span>
        </div>
      </div>

      {areaStart && areaEnd && !isProcessingArea && (
        <div className="mb-2 flex gap-2">
          <button
            onClick={handleApplyToArea}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Apply to Selected Area
          </button>
          <button
            onClick={handleCancelArea}
            className="px-3 py-1 bg-gray-400 text-white rounded hover:bg-gray-500"
          >
            Cancel Selection
          </button>
        </div>
      )}

      {isProcessingArea && (
        <div className="mb-2 w-full max-w-md">
          <div className="text-center mb-1">{`Processing... ${processingProgress}%`}</div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full" 
              style={{ width: `${processingProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      <div className="border border-gray-300 overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="max-w-full"
        />
      </div>

      <button
        onClick={handleSave}
        className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        disabled={isProcessingArea}
      >
        Save Changes
      </button>
    </div>
  );
}