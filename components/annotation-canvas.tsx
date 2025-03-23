'use client';

import React, { useEffect, useState } from 'react';
import { useCanvasInitialization } from '../hooks/useCanvasInitialization';
import { useDrawingHandlers } from '../hooks/useDrawingHandlers';
import { useAnnotation } from '../context/annotation-context';
import { TOOLS } from '../utils/constants';
import { applyMagicBrush, applyMagicBrushToArea } from '@/utils/image-processing';

// UI Component for the toolbar
function ToolbarSection({
  onSave 
}: {
  onSave: () => void;
}) {
  const {tool,isErasing,brushSize,handleToolChange,handleEraseToggle,setBrushSize} = useAnnotation();
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <button
        className={`px-3 py-2 rounded ${tool === TOOLS.AREA_MAGIC_BRUSH && !isErasing ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        onClick={() => handleToolChange(TOOLS.AREA_MAGIC_BRUSH)}
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
        className={`px-3 py-2 rounded ${tool === TOOLS.PEN && !isErasing ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        onClick={() => handleToolChange(TOOLS.PEN)}
      >
        Pen
      </button>
      <button
        onClick={onSave}
        className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
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
          onChange={(e) => setBrushSize(parseInt(e.target.value))}
          className="w-32"
        />
        <span className="ml-2">{brushSize}px</span>
      </div>
    </div>
  );
}

// UI Component for area controls
function AreaControls({ 
  onApply, 
  onCancel 
}: {
  onApply: () => void;
  onCancel: () => void;
}) {
  const {areaStart,areaEnd,isProcessingArea,processingProgress} = useAnnotation();
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

export default function AnnotationCanvas({ 
  imageUrl, 
  onSave 
}: {
  imageUrl: string, 
  onSave: (imageData: string, annotatedAreas: {
    x: number;
    y: number;
    x2?: number;
    y2?: number;
    radius?: number;
    type: string;
  }[]) => void
}) {
  // Use the canvas initialization hook
  const { canvasRef, context } = useCanvasInitialization(imageUrl);
  
  // Get state and actions from the annotation context
  const {
    brushSize,
    areaStart,
    areaEnd,
    isProcessingArea,
    tempImageData,
    originalImageData,
    annotatedAreas,
    setTempImageData,
    setOriginalImageData,
    resetAreaSelection,
    setProcessingProgress,
    setProcessingArea,
    addAnnotatedArea
  } = useAnnotation();

  // Use the drawing handlers hook
  const { startDrawing, draw, stopDrawing } = useDrawingHandlers(
    context as CanvasRenderingContext2D,
    canvasRef.current as HTMLCanvasElement
  );

  // Store original image data when canvas is initialized
  useEffect(() => {
    if (context && canvasRef.current && !originalImageData) {
      const imgData = context.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
      setOriginalImageData(imgData);
    }
  }, [context, canvasRef, originalImageData, setOriginalImageData]);

  // Effect to draw selection rectangle when area changes
  useEffect(() => {
    if (!context || !areaStart || !areaEnd) return;
    
    // Save the current image state if we haven't already
    if (!tempImageData && canvasRef.current) {
      const imgData = context.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
      setTempImageData(imgData);
    } else if (tempImageData) {
      // Restore the original image state
      context.putImageData(tempImageData, 0, 0);
    }

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
  }, [context, tempImageData, areaStart, areaEnd, setTempImageData, canvasRef]);

  // Handlers for UI controls
  const handleSave = () => {
    if (!canvasRef.current) return;
    const imageData = canvasRef.current.toDataURL('image/png');
    onSave(imageData, annotatedAreas);
  };

  const handleApplyToArea = async () => {
    if (areaStart && areaEnd && !isProcessingArea && canvasRef.current && context) {
      // Set processing flag to show progress indicator
      setProcessingArea(true);
      
      try {
        // Make sure we have the original image data for reference
        const origImgData = originalImageData || 
          context.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
        
        await applyMagicBrushToArea({
          areaStart,
          areaEnd,
          context,
          originalImageData: origImgData,
          tempImageData,
          brushSize,
          onProgressUpdate: setProcessingProgress,
          onComplete: (areaInfo) => {
            addAnnotatedArea(areaInfo);
            resetAreaSelection();
            setProcessingArea(false);
            setProcessingProgress(0);
          }
        });
      } catch (error) {
        console.error("Error applying magic brush to area:", error);
        setProcessingArea(false);
        setProcessingProgress(0);
      }
    }
  };

  const handleCancelArea = () => {
    if (tempImageData && context) {
      context.putImageData(tempImageData, 0, 0);
    }
    resetAreaSelection();
  };

  return (
    <div className="flex flex-col items-center">
      <ToolbarSection 
        onSave={handleSave}
      />

      <AreaControls 
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