'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import {debounce} from 'lodash';
// Constants
const TOOLS = {
  AREA_MAGIC_BRUSH: 'area-magic-brush',
  ERASER: 'eraser',
  PEN: 'pen'
};

const DEFAULT_BRUSH_SIZE = 20;
const PROCESSING_CHUNK_SIZE = 100;
const SMOOTHING_KERNEL_SIZE = 5;
const COLOR_SIGMA = 150;

// Utility functions
const getPixelData = (imageData:ImageData, x:number, y:number) => {
  const index = (y * imageData.width + x) * 4;
  return {
    r: imageData.data[index],
    g: imageData.data[index + 1],
    b: imageData.data[index + 2],
    a: imageData.data[index + 3],
    index
  };
};

const generateBrushMask = (brushSize:number) => {
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

const getEventCoordinates = (event:any, canvas:HTMLCanvasElement ) => {
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

export default function AnnotationCanvas({ imageUrl, onSave }:{imageUrl:string, onSave:{(imageData:string, annotatedAreas:{x: number;y: number;x2?: number;y2?: number;radius?: number;type: string;}[]):void}}) {
  // Refsx: number;y: number;x2?: number;y2?: number;radius?: number;type: string;}[]
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // State for canvas and drawing
  const [context, setContext] = useState<CanvasRenderingContext2D  | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState(TOOLS.AREA_MAGIC_BRUSH);
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);
  const [isErasing, setIsErasing] = useState(false);
  
  // State for image data
  const [originalImageData, setOriginalImageData] = useState<ImageData | undefined>(undefined);
  const [tempImageData, setTempImageData] = useState<ImageData | null>(null);
  const [brushMask, setBrushMask] = useState<any[] | null>(null);
  
  // State for area selection
  const [areaStart, setAreaStart] = useState<{x:number,y:number}| null>(null);
  const [areaEnd, setAreaEnd] = useState<{x:number,y:number} | null>(null);
  
  // State for processing
  const [isProcessingArea, setIsProcessingArea] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  
  // State for tracking changes
  const [annotatedAreas, setAnnotatedAreas] = useState<{x:number,y:number,x2?:number,y2?:number, radius?:number,type:string}[]>([]);

  // Initialize brush mask when brush size changes
  useEffect(() => {
    setBrushMask(generateBrushMask(brushSize));
  }, [brushSize]);

  // Initialize canvas when image is loaded
  useEffect(() => {
    if (!imageUrl) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    setContext(ctx);

    const image = new Image();
    image.onload = () => {
      canvas.width = image.width;
      canvas.height = image.height;
      ctx?.drawImage(image, 0, 0);
      setOriginalImageData(ctx?.getImageData(0, 0, canvas.width, canvas.height));
    };
    image.src = imageUrl;
  }, [imageUrl]);

  // Drawing handlers
  const applyEraser = useCallback((x:number, y:number) => {
    if (!context || !originalImageData || !brushMask || !canvasRef.current) return;

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
    setAnnotatedAreas(areas => [...areas, { x, y, radius, type: TOOLS.ERASER }]);
  }, [context, originalImageData, brushMask, brushSize]);

  const applyMagicBrush = useCallback((x:number, y:number, currentContext:CanvasRenderingContext2D , origImgData:ImageData|undefined, currentImgData:ImageData) => {
    if (!currentContext || !origImgData || !brushMask || !canvasRef.current) return;

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
        const blendFactor = brushMask[maskIndex];
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
  }, [brushSize, brushMask]);

  const applyFinalSmoothing = useCallback((x1:number,x2:number,y1:number,y2:number,imageData:ImageData) => {
    if (!context || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
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
  }, [context]);

  // Process a selected area with the magic brush
  const applyMagicBrushToArea = useCallback(() => {
    if (!context || !areaStart || !areaEnd || isProcessingArea || !canvasRef.current) return;
  
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
    
    // Get current image data once
    const canvas = canvasRef.current;
    const width = canvas.width;
    const height = canvas.height;
    
    const currentImageData = context.getImageData(0, 0, width, height);
    
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
    const totalChunks = Math.ceil(points.length / PROCESSING_CHUNK_SIZE);
    let currentChunk = 0;
    
    const processNextChunk = () => {
      // If we've processed all chunks, finish up
      if (currentChunk >= totalChunks) {
        finalizeProcessing();
        return;
      }
      
      // Calculate indices for this chunk
      const startIdx = currentChunk * PROCESSING_CHUNK_SIZE;
      const endIdx = Math.min(startIdx + PROCESSING_CHUNK_SIZE, points.length);
      
      // Process this chunk of points
      for (let i = startIdx; i < endIdx; i++) {
        const point = points[i];
        applyMagicBrush(point.x, point.y, context, originalImageData, currentImageData);
      }
      
      // Update the canvas with the changes
      context.putImageData(currentImageData, 0, 0);
      
      // Update progress
      currentChunk++;
      const progress = Math.min(100, Math.round((currentChunk / totalChunks) * 100));
      setProcessingProgress(progress);
      
      // Schedule the next chunk
      setTimeout(processNextChunk, 0);
    };
    
    const finalizeProcessing = () => {
      // Apply final smoothing
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
        x: x1, y: y1, x2, y2,
        type: TOOLS.AREA_MAGIC_BRUSH
      }]);
    };
    
    // Start processing
    processNextChunk();
  }, [context, areaStart, areaEnd, isProcessingArea, tempImageData, originalImageData, brushSize, applyMagicBrush, applyFinalSmoothing]);

  // Draw selection rectangle
  const drawSelectionRect = useCallback(() => {
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
  }, [context, tempImageData, areaStart, areaEnd]);

  // Debounced eraser
  const debouncedApplyEraser = useCallback(
    debounce((x, y) => {
      applyEraser(x, y);
    }, 10),
    [applyEraser]
  );

  // Event handlers
  const startDrawing = useCallback((e:any) => {
    e.preventDefault();
    if (!context || !canvasRef.current) return;
    
    setIsDrawing(true);
    const { x: offsetX, y: offsetY } = getEventCoordinates(e, canvasRef.current);

    if (isErasing) {
      debouncedApplyEraser(offsetX, offsetY);
    } else if (tool === TOOLS.PEN) {
      context.beginPath();
      context.moveTo(offsetX, offsetY);
    } else if (tool === TOOLS.AREA_MAGIC_BRUSH) {
      // Save the current canvas state for drawing rectangles
      setTempImageData(context.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height));
      setAreaStart({ x: offsetX, y: offsetY });
      setAreaEnd({ x: offsetX, y: offsetY });
    }
  }, [context, isErasing, tool, debouncedApplyEraser]);

  const draw = useCallback((e:any) => {
    e.preventDefault();
    if (!isDrawing || !context || !canvasRef.current) return;

    const { x: offsetX, y: offsetY } = getEventCoordinates(e, canvasRef.current);

    if (isErasing) {
      debouncedApplyEraser(offsetX, offsetY);
    } else if (tool === TOOLS.PEN) {
      context.lineTo(offsetX, offsetY);
      context.stroke();
    } else if (tool === TOOLS.AREA_MAGIC_BRUSH && tempImageData) {
      // Update the end point and redraw the selection rectangle
      setAreaEnd({ x: offsetX, y: offsetY });
    }
  }, [isDrawing, context, isErasing, tool, tempImageData, debouncedApplyEraser]);

  // Update selection rectangle when area end changes
  useEffect(() => {
    if (tool === TOOLS.AREA_MAGIC_BRUSH && isDrawing && areaStart && areaEnd) {
      drawSelectionRect();
    }
  }, [tool, isDrawing, areaStart, areaEnd, drawSelectionRect]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    
    if (tool === TOOLS.PEN && context) {
      context.closePath();
    }
    
    setIsDrawing(false);
  }, [isDrawing, tool, context]);

  // UI action handlers
  const handleToolChange = useCallback((newTool:string) => {
    setTool(newTool);
    setAreaStart(null);
    setAreaEnd(null);
    setTempImageData(null);
    setIsErasing(false);
  }, []);

  const handleEraseToggle = useCallback(() => {
    setIsErasing(!isErasing);
    setTool(TOOLS.ERASER);
    setAreaStart(null);
    setAreaEnd(null);
    setTempImageData(null);
  }, [isErasing]);

  const handleSave = useCallback(() => {
    if (!canvasRef.current) return;
    const imageData = canvasRef.current.toDataURL('image/png');
    onSave(imageData, annotatedAreas);
  }, [annotatedAreas, onSave]);

  const handleApplyToArea = useCallback(() => {
    if (areaStart && areaEnd && !isProcessingArea) {
      applyMagicBrushToArea();
    }
  }, [areaStart, areaEnd, isProcessingArea, applyMagicBrushToArea]);

  const handleCancelArea = useCallback(() => {
    if (tempImageData && context) {
      context.putImageData(tempImageData, 0, 0);
    }
    setAreaStart(null);
    setAreaEnd(null);
    setTempImageData(null);
  }, [tempImageData, context]);

  return (
    <div className="flex flex-col items-center">
      <ToolbarSection 
        tool={tool}
        isErasing={isErasing}
        brushSize={brushSize}
        onToolChange={handleToolChange}
        onEraseToggle={handleEraseToggle}
        onBrushSizeChange={(size) => setBrushSize(parseInt(size))}
        onSave={handleSave}
      />

      <AreaControls 
        areaStart={areaStart}
        areaEnd={areaEnd}
        isProcessingArea={isProcessingArea}
        processingProgress={processingProgress}
        onApply={handleApplyToArea}
        onCancel={handleCancelArea}
      />

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
    </div>
  );
}

type ToolbarSectionProps = {
  tool: string;
  isErasing: boolean;
  brushSize: number;
  onToolChange: (tool:string) => void;
  onEraseToggle: () => void;
  onBrushSizeChange: (size:string) => void;
  onSave: () => void;
}

// UI Component for the toolbar
function ToolbarSection({ tool, isErasing, brushSize, onToolChange, onEraseToggle, onBrushSizeChange, onSave }:ToolbarSectionProps) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <button
        className={`px-3 py-2 rounded ${tool === TOOLS.AREA_MAGIC_BRUSH && !isErasing ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        onClick={() => onToolChange(TOOLS.AREA_MAGIC_BRUSH)}
      >
        Area Magic Brush
      </button>
      <button
        className={`px-3 py-2 rounded ${isErasing ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
        onClick={onEraseToggle}
      >
        {isErasing ? 'Stop Erasing' : 'Erase'}
      </button>
      <button
        className={`px-3 py-2 rounded ${tool === TOOLS.PEN && !isErasing ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        onClick={() => onToolChange(TOOLS.PEN)}
      >
        Pen
      </button>
      <button
        onClick={onSave}
        className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        // disabled={isProcessingArea}
      >
        Save
      </button>
      <div className="flex items-center">
        <span className="mr-2">Size:</span>
        <input
          type="range"
          min="5"
          max="50"
          value={brushSize}
          onChange={(e) => onBrushSizeChange(e.target.value)}
          className="w-32"
        />
        <span className="ml-2">{brushSize}px</span>
      </div>
    </div>
  );
}

type AreaControlsProps = {
  areaStart: {x:number,y:number} | null;
  areaEnd: {x:number,y:number} | null;
  isProcessingArea: boolean;
  processingProgress: number;
  onApply: () => void;
  onCancel: () => void;
}

// UI Component for area controls
function AreaControls({ areaStart, areaEnd, isProcessingArea, processingProgress, onApply, onCancel }:AreaControlsProps) {
  if (isProcessingArea) {
    return (
      <div className="mb-2 w-full max-w-md">
        <div className="text-center mb-1">{`Processing... ${processingProgress}%`}</div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full" 
            style={{ width: `${processingProgress}%` }}
          ></div>
        </div>
      </div>
    );
  }
  
  if (areaStart && areaEnd) {
    return (
      <div className="mb-2 flex gap-2">
        <button
          onClick={onApply}
          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Apply to Selected Area
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 bg-gray-400 text-white rounded hover:bg-gray-500"
        >
          Cancel Selection
        </button>
      </div>
    );
  }
  
  return null;
}