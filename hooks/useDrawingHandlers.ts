import { useCallback, useRef } from 'react';
import { throttle } from 'lodash';
import { getEventCoordinates } from '../utils/canvas-util';
import { TOOLS } from '../context/annotation-context';
import { applyEraser, applyMagicBrush } from '../utils/image-processing';
import { useAnnotation } from '../context/annotation-context';

export function useDrawingHandlers(context: CanvasRenderingContext2D | null, canvasRef: HTMLCanvasElement | null) {
  const {
    isDrawing, setDrawing,
    tool, isErasing,
    areaStart, setAreaStart,
    setAreaEnd, tempImageData,
    setTempImageData,
    brushSize, brushMask,
    originalImageData,
    addAnnotatedArea,
    setProcessingArea
  } = useAnnotation();

  // Save last position for pen tool
  const lastPosition = useRef<{ x: number, y: number } | null>(null);

  // Use throttle instead of debounce for smoother drawing operations
  // Throttled eraser - applies at regular intervals for better performance
  const throttledApplyEraser = useCallback(
    throttle((x, y) => {
      if (!context || !originalImageData) return;
      
      const result = applyEraser(x, y, context, originalImageData, brushMask, brushSize);
      if (result) {
        addAnnotatedArea(result);
      }
    }, 16), // ~60fps
    [context, originalImageData, brushMask, brushSize, addAnnotatedArea]
  );

  // Throttled brush - for when we implement direct brush application
  const throttledApplyBrush = useCallback(
    throttle((x, y) => {
      if (!context || !originalImageData) return;
      
      const currentImageData = context.getImageData(0, 0, canvasRef?.width || 0, canvasRef?.height || 0);
      applyMagicBrush(x, y, context, originalImageData, currentImageData, brushSize, brushMask);
      context.putImageData(currentImageData, 0, 0);
      
      // Add to annotated areas
      addAnnotatedArea({ x, y, radius: brushSize/2, type: 'magic-brush' });
    }, 16),
    [context, originalImageData, canvasRef, brushSize, brushMask, addAnnotatedArea]
  );

  // Start drawing handler
  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent | any) => {
    e.preventDefault();
    if (!context || !canvasRef) return;
    
    const { x: offsetX, y: offsetY } = getEventCoordinates(e, canvasRef);
    lastPosition.current = { x: offsetX, y: offsetY };
    
    setDrawing(true);

    if (isErasing) {
      throttledApplyEraser(offsetX, offsetY);
    } else if (tool === TOOLS.PEN) {
      context.beginPath();
      context.lineWidth = brushSize;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = '#000000';
      context.moveTo(offsetX, offsetY);
    } else if (tool === TOOLS.AREA_MAGIC_BRUSH) {
      // Save the canvas state before drawing rectangles
      setTempImageData(context.getImageData(0, 0, canvasRef.width, canvasRef.height));
      setAreaStart({ x: offsetX, y: offsetY });
      setAreaEnd({ x: offsetX, y: offsetY });
    }
  }, [
    context, canvasRef, isErasing, tool, 
    setDrawing, setTempImageData, 
    setAreaStart, setAreaEnd, 
    throttledApplyEraser, brushSize
  ]);

  // Drawing handler
  const draw = useCallback((e: React.MouseEvent | React.TouchEvent | any) => {
    e.preventDefault();
    if (!isDrawing || !context || !canvasRef) return;

    const { x: offsetX, y: offsetY } = getEventCoordinates(e, canvasRef);

    if (isErasing) {
      throttledApplyEraser(offsetX, offsetY);
    } else if (tool === TOOLS.PEN && lastPosition.current) {
      // Line interpolation for smoother drawing
      const { x: lastX, y: lastY } = lastPosition.current;
      
      // For long distances, interpolate points to prevent gaps
      const dx = offsetX - lastX;
      const dy = offsetY - lastY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance >= brushSize / 2) {
        const steps = Math.ceil(distance / (brushSize / 4));
        for (let i = 0; i < steps; i++) {
          const t = i / steps;
          const x = lastX + dx * t;
          const y = lastY + dy * t;
          
          context.lineTo(x, y);
        }
      } else {
        context.lineTo(offsetX, offsetY);
      }
      
      context.stroke();
      
      // Start a new path to avoid connecting lines when there's a gap
      context.beginPath();
      context.moveTo(offsetX, offsetY);
      
      lastPosition.current = { x: offsetX, y: offsetY };
    } else if (tool === TOOLS.AREA_MAGIC_BRUSH && tempImageData) {
      // Update the end point for selection rectangle
      setAreaEnd({ x: offsetX, y: offsetY });
    }
  }, [
    isDrawing, context, canvasRef, isErasing, tool, 
    tempImageData, throttledApplyEraser, 
    setAreaEnd, brushSize
  ]);

  // Stop drawing handler
  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    
    if (tool === TOOLS.PEN && context) {
      context.closePath();
      
      // Add the drawn path to annotated areas if significant
      if (lastPosition.current && context.canvas) {
        addAnnotatedArea({ 
          x: lastPosition.current.x, 
          y: lastPosition.current.y,
          type: 'pen' 
        });
      }
    }
    
    lastPosition.current = null;
    setDrawing(false);
  }, [isDrawing, tool, context, setDrawing, addAnnotatedArea]);

  // Complete function to cancel current drawing/processing
  const cancelDrawing = useCallback(() => {
    if (tempImageData && context) {
      context.putImageData(tempImageData, 0, 0);
    }
    
    lastPosition.current = null;
    setDrawing(false);
    setProcessingArea(false);
    setAreaStart(null);
    setAreaEnd(null);
    setTempImageData(null);
  }, [context, tempImageData, setDrawing, setProcessingArea, setAreaStart, setAreaEnd, setTempImageData]);

  return {
    startDrawing,
    draw,
    stopDrawing,
    cancelDrawing
  };
}