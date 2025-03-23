import { useEffect, useRef, useState, useCallback } from 'react';
import { useAnnotation } from '../context/annotation-context';
import { debounce } from 'lodash';

export function useCanvasInitialization(imageUrl: string) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const { 
    setOriginalImageData, 
    setTempImageData,
    resetAreaSelection,
    clearAnnotations
  } = useAnnotation();

  // Function to set up canvas with the image
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    
    if (!canvas || !image || !image.complete) return;
    
    const ctx = canvas.getContext('2d', { 
      alpha: false, // Improve performance for non-transparent images
      willReadFrequently: true // Optimize for frequent pixel manipulation
    });
    
    if (!ctx) {
      setError('Could not initialize canvas context');
      return;
    }
    
    // Set canvas dimensions to match image
    canvas.width = image.width;
    canvas.height = image.height;
    
    // Clear canvas before drawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    
    // Store canvas context
    setContext(ctx);
    
    // Store original image data in context
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setOriginalImageData(imageData);
    setTempImageData(null);
    resetAreaSelection();
    clearAnnotations();
    
    setIsLoading(false);
  }, [setOriginalImageData, setTempImageData, resetAreaSelection, clearAnnotations]);

  // Handle window resize with debouncing
  const handleResize = useCallback(
    debounce(() => {
      if (imageRef.current && imageRef.current.complete) {
        setupCanvas();
      }
    }, 250),
    [setupCanvas]
  );

  // Load the image
  useEffect(() => {
    if (!imageUrl) return;
    
    setIsLoading(true);
    setError(null);
    
    const image = new Image();
    imageRef.current = image;
    
    image.onload = () => {
      setupCanvas();
    };
    
    image.onerror = () => {
      setError('Failed to load image');
      setIsLoading(false);
    };
    
    image.src = imageUrl;
    
    // Set up resize handler
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      
      // Clean up to prevent memory leaks
      if (imageRef.current) {
        imageRef.current.onload = null;
        imageRef.current.onerror = null;
        imageRef.current = null;
      }
    };
  }, [imageUrl, setupCanvas, handleResize]);

  return { 
    canvasRef, 
    context, 
    isLoading, 
    error 
  };
}