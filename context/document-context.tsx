'use client'
import React, { createContext, useContext, useState, useReducer, useCallback } from 'react';

// Types
export type AnnotatedArea = {
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  radius?: number;
  type: string;
};

export type AnnotatedImageData = {
  [index: number]: {
    imageData: string;
    annotatedAreas: AnnotatedArea[];
  };
};

// Constants
export const TOOLS = {
  AREA_MAGIC_BRUSH: 'area-magic-brush',
  ERASER: 'eraser',
  PEN: 'pen'
};

export const DEFAULT_BRUSH_SIZE = 20;

// Context state type
type DocumentState = {
  // PDF processing state
  currentStep: 'upload' | 'annotate' | 'export';
  imageUrls: string[];
  currentPageIndex: number;
  annotatedImages: AnnotatedImageData;
  progress: number;
  error: string | null;
};

// Action types
type DocumentAction =
  | { type: 'SET_CURRENT_STEP'; payload: 'upload' | 'annotate' | 'export' }
  | { type: 'SET_IMAGE_URLS'; payload: string[] }
  | { type: 'SET_CURRENT_PAGE_INDEX'; payload: number }
  | { type: 'SET_ANNOTATED_IMAGE'; payload: { index: number; imageData: string; annotatedAreas: AnnotatedArea[] } }
  | { type: 'SET_PROGRESS'; payload: number }
  | { type: 'SET_ERROR'; payload: string | null }

const initialState: DocumentState = {
  currentStep: 'upload',
  imageUrls: [],
  currentPageIndex: 0,
  annotatedImages: {},
  progress: 0,
  error: null,
};

// Reducer
function documentReducer(state: DocumentState, action: DocumentAction): DocumentState {
  switch (action.type) {
    case 'SET_CURRENT_STEP':
      return { ...state, currentStep: action.payload };
    case 'SET_IMAGE_URLS':
      return { ...state, imageUrls: action.payload };
    case 'SET_CURRENT_PAGE_INDEX':
      return { ...state, currentPageIndex: action.payload };
    case 'SET_ANNOTATED_IMAGE':
      return {
        ...state,
        annotatedImages: {
          ...state.annotatedImages,
          [action.payload.index]: {
            imageData: action.payload.imageData,
            annotatedAreas: action.payload.annotatedAreas,
          },
        },
      };
    case 'SET_PROGRESS':
      return { ...state, progress: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

// Create context
interface DocumentContextProps {
  state: DocumentState;
  dispatch: React.Dispatch<DocumentAction>;
  
  // Helper functions
  handlePdfUploaded: (urls: string[], pageCount: number) => void;
  handleSaveAnnotation: (imageData: string, annotatedAreas: AnnotatedArea[]) => void;
  handlePageNavigation: (newIndex: number) => void;
  handleExport: () => Promise<void>;
}

const DocumentContext = createContext<DocumentContextProps | null>(null);

// Provider component
export function DocumentProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(documentReducer, initialState);
  
  const handlePdfUploaded = useCallback((urls: string[], pageCount: number) => {
    dispatch({ type: 'SET_IMAGE_URLS', payload: urls });
    dispatch({ type: 'SET_CURRENT_STEP', payload: 'annotate' });
  }, []);
  
  const handleSaveAnnotation = useCallback((imageData: string, annotatedAreas: AnnotatedArea[]) => {
    dispatch({
      type: 'SET_ANNOTATED_IMAGE',
      payload: {
        index: state.currentPageIndex,
        imageData,
        annotatedAreas,
      },
    });
  }, [state.currentPageIndex]);
  
  const handlePageNavigation = useCallback((newIndex: number) => {
    if (newIndex >= 0 && newIndex < state.imageUrls.length) {
      dispatch({ type: 'SET_CURRENT_PAGE_INDEX', payload: newIndex });
    }
  }, [state.imageUrls.length]);
  
  const handleExport = useCallback(async () => {
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_PROGRESS', payload: 0 });
    dispatch({ type: 'SET_CURRENT_STEP', payload: 'export' });
    
    // Create array of all pages - use annotated versions when available
    const pagesToExport = state.imageUrls.map((originalUrl, index) => {
      return state.annotatedImages[index]?.imageData || originalUrl;
    });

    
    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          images: pagesToExport,
          // filename: `GhostWrite.pdf`
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process PDF');
      }
      
      // Create a blob from the PDF data
      const blob = await response.blob();
      dispatch({ type: 'SET_PROGRESS', payload: 70 });
      
      // Create a download link and trigger it
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = 'my-document.pdf'; // You can set this dynamically
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      a.remove();

      dispatch({ type: 'SET_PROGRESS', payload: 100 });
  
      
      // Return to annotation after short delay
      setTimeout(() => {
        dispatch({ type: 'SET_CURRENT_STEP', payload: 'annotate' });
      }, 2000);
      
    } catch (error: any) {
      console.error('Error exporting PDF:', error);
      dispatch({ 
        type: 'SET_ERROR', 
        payload: error.message || 'Failed to export annotated PDF' 
      });
      
      // Return to annotation after error
      setTimeout(() => {
        dispatch({ type: 'SET_CURRENT_STEP', payload: 'annotate' });
      }, 2000);
    }
  }, [state.imageUrls, state.annotatedImages]);
  ;
  
  const contextValue: DocumentContextProps = {
    state,
    dispatch,
    handlePdfUploaded,
    handleSaveAnnotation,
    handlePageNavigation,
    handleExport,
  };
  
  return (
    <DocumentContext.Provider value={contextValue}>
      {children}
    </DocumentContext.Provider>
  );
}

// Custom hook
export function useDocument() {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error('useImage must be used within an ImageProvider');
  }
  return context;
}