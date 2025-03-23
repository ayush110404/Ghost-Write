import { useCallback, useRef, useEffect } from 'react';
import { throttle } from 'lodash';
import { getEventCoordinates } from '../utils/canvas-util';
import { TOOLS } from '../context/annotation-context';
import { applyEraser, applyMagicBrush, applyMagicBrushToArea } from '../utils/image-processing';
import { useAnnotation } from '../context/annotation-context';

export function useDrawingHandlers(context: CanvasRenderingContext2D | null, canvasRef: HTMLCanvasElement | null) {
  const {
    isDrawing, setDrawing,
    tool, isErasing,
    areaStart, setAreaStart,
    areaEnd, setAreaEnd, 
    tempImageData, setTempImageData,
    brushSize, brushMask,
    originalImageData,
    addAnnotatedArea,
    setProcessingArea,
    setProcessingProgress,
    resetAreaSelection
  } = useAnnotation();

  // Save last position for pen tool
  const lastPosition = useRef<{ x: number, y: number } | null>(null);
  // Flag to track if we're currently in a mouseup/touchend event
  const isEndingDrag = useRef<boolean>(false);

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

  // Throttled area processing to prevent performance issues
  const throttledApplyToArea = useCallback(
    throttle(async () => {
      if (!areaStart || !areaEnd || !context || !originalImageData || !canvasRef) return;
      
      // Minimum area size check to prevent processing tiny selections
      const width = Math.abs(areaEnd.x - areaStart.x);
      const height = Math.abs(areaEnd.y - areaStart.y);
      if (width < 5 || height < 5) {
        resetAreaSelection();
        return;
      }

      // Set processing flag to show progress indicator
      setProcessingArea(true);

      try {
        await applyMagicBrushToArea({
          areaStart,
          areaEnd,
          context,
          originalImageData,
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
        resetAreaSelection();
      }
    }, 300), // Lower frequency for this heavy operation
    [areaStart, areaEnd, context, originalImageData, tempImageData, brushSize, setProcessingArea, 
     setProcessingProgress, addAnnotatedArea, resetAreaSelection, canvasRef]
  );

  // Effect to trigger area processing when area selection is complete
  useEffect(() => {
    if (tool === TOOLS.AREA_MAGIC_BRUSH && 
        !isDrawing && 
        areaStart && 
        areaEnd && 
        isEndingDrag.current) {
      throttledApplyToArea();
      isEndingDrag.current = false;
    }
  }, [tool, isDrawing, areaStart, areaEnd, throttledApplyToArea]);

  // Start drawing handler
  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent | any) => {
    e.preventDefault();
    if (!context || !canvasRef) return;
    
    const { x: offsetX, y: offsetY } = getEventCoordinates(e, canvasRef);
    lastPosition.current = { x: offsetX, y: offsetY };
    
    setDrawing(true);
    isEndingDrag.current = false;

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
  const stopDrawing = useCallback((e?: React.MouseEvent | React.TouchEvent | any) => {
    if (!isDrawing) return;
    
    if (e) e.preventDefault();
    
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
    } else if (tool === TOOLS.AREA_MAGIC_BRUSH) {
      // Set flag to trigger auto-processing in the effect
      isEndingDrag.current = true;
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
    isEndingDrag.current = false;
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