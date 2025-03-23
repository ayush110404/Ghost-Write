import React, { createContext, useContext, useReducer, useMemo, ReactNode, useCallback } from 'react';
import { generateBrushMask } from '../utils/canvas-util';

// Define constants
export const TOOLS = {
  AREA_MAGIC_BRUSH: 'area-magic-brush',
  ERASER: 'eraser',
  PEN: 'pen'
};

export const DEFAULT_BRUSH_SIZE = 20;

// Types for state objects
export type Point = {
  x: number;
  y: number;
};

export type AnnotatedArea = {
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  radius?: number;
  type: string;
};

// Initial state
type AnnotationState = {
  tool: string;
  brushSize: number;
  isErasing: boolean;
  isDrawing: boolean;
  areaStart: Point | null;
  areaEnd: Point | null;
  isProcessingArea: boolean;
  processingProgress: number;
  originalImageData: ImageData | null;
  tempImageData: ImageData | null;
  annotatedAreas: AnnotatedArea[];
};

const initialState: AnnotationState = {
  tool: TOOLS.AREA_MAGIC_BRUSH,
  brushSize: DEFAULT_BRUSH_SIZE,
  isErasing: false,
  isDrawing: false,
  areaStart: null,
  areaEnd: null,
  isProcessingArea: false,
  processingProgress: 0,
  originalImageData: null,
  tempImageData: null,
  annotatedAreas: [],
};

// Action types as enum for better type safety
enum ActionType {
  SET_TOOL = 'SET_TOOL',
  SET_BRUSH_SIZE = 'SET_BRUSH_SIZE',
  SET_ERASING = 'SET_ERASING',
  SET_DRAWING = 'SET_DRAWING',
  SET_AREA_START = 'SET_AREA_START',
  SET_AREA_END = 'SET_AREA_END',
  SET_PROCESSING_AREA = 'SET_PROCESSING_AREA',
  SET_PROCESSING_PROGRESS = 'SET_PROCESSING_PROGRESS',
  SET_ORIGINAL_IMAGE_DATA = 'SET_ORIGINAL_IMAGE_DATA',
  SET_TEMP_IMAGE_DATA = 'SET_TEMP_IMAGE_DATA',
  ADD_ANNOTATED_AREA = 'ADD_ANNOTATED_AREA',
  RESET_AREA_SELECTION = 'RESET_AREA_SELECTION',
  CLEAR_ANNOTATIONS = 'CLEAR_ANNOTATIONS'
}

// Properly typed actions with discriminated union
type Action = 
  | { type: ActionType.SET_TOOL; payload: string }
  | { type: ActionType.SET_BRUSH_SIZE; payload: number }
  | { type: ActionType.SET_ERASING; payload: boolean }
  | { type: ActionType.SET_DRAWING; payload: boolean }
  | { type: ActionType.SET_AREA_START; payload: Point | null }
  | { type: ActionType.SET_AREA_END; payload: Point | null }
  | { type: ActionType.SET_PROCESSING_AREA; payload: boolean }
  | { type: ActionType.SET_PROCESSING_PROGRESS; payload: number }
  | { type: ActionType.SET_ORIGINAL_IMAGE_DATA; payload: ImageData | null }
  | { type: ActionType.SET_TEMP_IMAGE_DATA; payload: ImageData | null }
  | { type: ActionType.ADD_ANNOTATED_AREA; payload: AnnotatedArea }
  | { type: ActionType.RESET_AREA_SELECTION }
  | { type: ActionType.CLEAR_ANNOTATIONS };

// Reducer function with proper typing
function reducer(state: AnnotationState, action: Action): AnnotationState {
  switch (action.type) {
    case ActionType.SET_TOOL: 
      return { ...state, tool: action.payload };
    case ActionType.SET_BRUSH_SIZE:
      return { ...state, brushSize: action.payload };
    case ActionType.SET_ERASING:
      return { ...state, isErasing: action.payload };
    case ActionType.SET_DRAWING:
      return { ...state, isDrawing: action.payload };
    case ActionType.SET_AREA_START:
      return { ...state, areaStart: action.payload };
    case ActionType.SET_AREA_END:
      return { ...state, areaEnd: action.payload };
    case ActionType.SET_PROCESSING_AREA:
      return { ...state, isProcessingArea: action.payload };
    case ActionType.SET_PROCESSING_PROGRESS:
      return { ...state, processingProgress: action.payload };
    case ActionType.SET_ORIGINAL_IMAGE_DATA:
      return { ...state, originalImageData: action.payload };
    case ActionType.SET_TEMP_IMAGE_DATA:
      return { ...state, tempImageData: action.payload };
    case ActionType.ADD_ANNOTATED_AREA:
      return { 
        ...state, 
        annotatedAreas: [...state.annotatedAreas, action.payload] 
      };
    case ActionType.RESET_AREA_SELECTION:
      return {
        ...state,
        areaStart: null,
        areaEnd: null,
        tempImageData: null,
      };
    case ActionType.CLEAR_ANNOTATIONS:
      return {
        ...state,
        annotatedAreas: []
      };
    default:
      return state;
  }
}

// Define the context type
type AnnotationContextType = AnnotationState & {
  brushMask: number[];
  setTool: (tool: string) => void;
  setBrushSize: (size: number) => void;
  setErasing: (isErasing: boolean) => void;
  setDrawing: (isDrawing: boolean) => void;
  setAreaStart: (point: Point | null) => void;
  setAreaEnd: (point: Point | null) => void;
  setProcessingArea: (isProcessing: boolean) => void;
  setProcessingProgress: (progress: number) => void;
  setOriginalImageData: (data: ImageData | null) => void;
  setTempImageData: (data: ImageData | null) => void;
  addAnnotatedArea: (area: AnnotatedArea) => void;
  resetAreaSelection: () => void;
  clearAnnotations: () => void;
  handleToolChange: (newTool: string) => void;
  handleEraseToggle: () => void;
};

// Create context with default value
const AnnotationContext = createContext<AnnotationContextType | undefined>(undefined);

// Provider component
export function AnnotationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Memoize brush mask - only recalculate when brush size changes
  const brushMask = useMemo(() => 
    generateBrushMask(state.brushSize), 
    [state.brushSize]
  );

  // Action creators using useCallback to prevent unnecessary recreations
  const setTool = useCallback((tool: string) => 
    dispatch({ type: ActionType.SET_TOOL, payload: tool }), []);
  
  const setBrushSize = useCallback((size: number) => 
    dispatch({ type: ActionType.SET_BRUSH_SIZE, payload: size }), []);
  
  const setErasing = useCallback((isErasing: boolean) => 
    dispatch({ type: ActionType.SET_ERASING, payload: isErasing }), []);
  
  const setDrawing = useCallback((isDrawing: boolean) => 
    dispatch({ type: ActionType.SET_DRAWING, payload: isDrawing }), []);
  
  const setAreaStart = useCallback((point: Point | null) => 
    dispatch({ type: ActionType.SET_AREA_START, payload: point }), []);
  
  const setAreaEnd = useCallback((point: Point | null) => 
    dispatch({ type: ActionType.SET_AREA_END, payload: point }), []);
  
  const setProcessingArea = useCallback((isProcessing: boolean) => 
    dispatch({ type: ActionType.SET_PROCESSING_AREA, payload: isProcessing }), []);
  
  const setProcessingProgress = useCallback((progress: number) => 
    dispatch({ type: ActionType.SET_PROCESSING_PROGRESS, payload: progress }), []);
  
  const setOriginalImageData = useCallback((data: ImageData | null) => 
    dispatch({ type: ActionType.SET_ORIGINAL_IMAGE_DATA, payload: data }), []);
  
  const setTempImageData = useCallback((data: ImageData | null) => 
    dispatch({ type: ActionType.SET_TEMP_IMAGE_DATA, payload: data }), []);
  
  const addAnnotatedArea = useCallback((area: AnnotatedArea) => 
    dispatch({ type: ActionType.ADD_ANNOTATED_AREA, payload: area }), []);
  
  const resetAreaSelection = useCallback(() => 
    dispatch({ type: ActionType.RESET_AREA_SELECTION }), []);
  
  const clearAnnotations = useCallback(() => 
    dispatch({ type: ActionType.CLEAR_ANNOTATIONS }), []);

  // Complex action functions
  const handleToolChange = useCallback((newTool: string) => {
    dispatch({ type: ActionType.SET_TOOL, payload: newTool });
    dispatch({ type: ActionType.SET_ERASING, payload: false });
    dispatch({ type: ActionType.RESET_AREA_SELECTION });
  }, []);

  const handleEraseToggle = useCallback(() => {
    const newErasingState = !state.isErasing;
    dispatch({ type: ActionType.SET_ERASING, payload: newErasingState });
    if (newErasingState) {
      dispatch({ type: ActionType.SET_TOOL, payload: TOOLS.ERASER });
    }
    dispatch({ type: ActionType.RESET_AREA_SELECTION });
  }, [state.isErasing]);

  // Value to be provided by the context - memoized to prevent unnecessary re-renders
  const value = useMemo(() => ({
    ...state,
    brushMask,
    setTool,
    setBrushSize,
    setErasing,
    setDrawing,
    setAreaStart,
    setAreaEnd,
    setProcessingArea,
    setProcessingProgress,
    setOriginalImageData,
    setTempImageData,
    addAnnotatedArea,
    resetAreaSelection,
    clearAnnotations,
    handleToolChange,
    handleEraseToggle,
  }), [
    state,
    brushMask,
    setTool,
    setBrushSize,
    setErasing,
    setDrawing,
    setAreaStart,
    setAreaEnd,
    setProcessingArea,
    setProcessingProgress,
    setOriginalImageData,
    setTempImageData,
    addAnnotatedArea,
    resetAreaSelection,
    clearAnnotations,
    handleToolChange,
    handleEraseToggle
  ]);

  return (
    <AnnotationContext.Provider value={value}>
      {children}
    </AnnotationContext.Provider>
  );
}

// Custom hook to use the annotation context
export function useAnnotation(): AnnotationContextType {
  const context = useContext(AnnotationContext);
  if (context === undefined) {
    throw new Error('useAnnotation must be used within an AnnotationProvider');
  }
  return context;
}