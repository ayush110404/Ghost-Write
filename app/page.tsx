// app/page.js
'use client';

import { useState, useEffect } from 'react';
import PdfUploader from '@/components/pdf-uploader';
import AnnotationCanvas from '@/components/annotation-canvas';
import { AnnotationProvider } from '@/context/annotation-context';
import { useDocument } from '@/context/document-context';

type AnnotatedImageProp = {
  [index:number]:{
    imageData: string, 
    annotatedAreas: AnnotatedArea[]
  }
}
type AnnotatedArea = {
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  radius?: number;
  type: string;
}

export default function Home() {
  const { 
    state, 
    handlePdfUploaded, 
    handleSaveAnnotation, 
    handlePageNavigation, 
    handleExport 
  } = useDocument();

  const { 
    currentStep, 
    imageUrls, 
    currentPageIndex, 
    annotatedImages, 
    progress,
    error
  } = state;  
  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8">
          PDF Magic Brush Annotation Tool
        </h1>
        
        {currentStep === 'upload' && (
          <PdfUploader onPdfUploaded={handlePdfUploaded} />
        )}
        
        {currentStep === 'annotate' && imageUrls.length > 0 && (
          <AnnotationProvider>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="mb-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold">
                Annotate Page {currentPageIndex + 1} of {imageUrls.length}
              </h2>
              <div className="flex space-x-2">
                <button
                  onClick={() => handlePageNavigation(currentPageIndex - 1)}
                  disabled={currentPageIndex === 0}
                  className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300"
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePageNavigation(currentPageIndex + 1)}
                  disabled={currentPageIndex === imageUrls.length - 1}
                  className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300"
                >
                  Next
                </button>
              </div>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                Use the Magic Brush to annotate areas you want to blend with surrounding content.
              </p>
              {Object.keys(annotatedImages).length > 0 && (
                <p className="text-xs text-green-600">
                  {Object.keys(annotatedImages).length} page(s) modified
                </p>
              )}
            </div>
            
            <AnnotationCanvas
              imageUrl={annotatedImages[currentPageIndex]?.imageData || imageUrls[currentPageIndex]}
              onSave={handleSaveAnnotation}
              key={`page-${currentPageIndex}`}
            />
            
            <div className="mt-6 flex justify-between">
              <div className="text-sm text-gray-500">
                Changes are automatically saved when navigating between pages
              </div>
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                Export Annotated PDF
              </button>
            </div>
          </div>
          </AnnotationProvider>
        )}
        
        {currentStep === 'export' && (
          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <h2 className="text-xl font-semibold mb-4">Processing Your PDF</h2>
            
            {error ? (
              <div className="text-red-600 mb-4">
                <p className="font-bold">Error</p>
                <p>{error}</p>
              </div>
            ) : (
              <>
                <div className="mb-4 w-full">
                  <div className="text-gray-600 mb-1">{progress}% complete</div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-purple-600 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
                <p className="text-gray-600">
                  Please wait while we process your annotations and prepare your document for download...
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}