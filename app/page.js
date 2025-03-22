// app/page.js
'use client';

import { useState, useEffect } from 'react';
import PdfUploader from '@/components/pdf-uploader';
import AnnotationCanvas from '@/components/annotation-canvas';

export default function Home() {
  const [currentStep, setCurrentStep] = useState('upload'); // 'upload', 'annotate', 'export'
  const [imageUrls, setImageUrls] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [annotatedImages, setAnnotatedImages] = useState({});
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState(null);
  
  const handlePdfUploaded = (urls, pageCount) => {
    setImageUrls(urls);
    setCurrentStep('annotate');
  };
  
  const handleSaveAnnotation = (imageData, annotatedAreas) => {
    setAnnotatedImages(prev => ({
      ...prev,
      [currentPageIndex]: { imageData, annotatedAreas }
    }));
  };
  
  // Handle navigation between pages - save current page before navigating
  const handlePageNavigation = (newIndex) => {
    // Only navigate if new index is valid
    if (newIndex >= 0 && newIndex < imageUrls.length) {
      setCurrentPageIndex(newIndex);
    }
  };
  
  const handleExport = async () => {
    setExportError(null);
    setExportProgress(0);
    setCurrentStep('export');
    
    // Create array of all pages - use annotated versions when available
    const pagesToExport = imageUrls.map((originalUrl, index) => {
      return annotatedImages[index]?.imageData || originalUrl;
    });
    
    try {
      // Save any unsaved changes on the current page
      const canvas = document.querySelector('canvas');
      if (canvas) {
        const currentPageImage = canvas.toDataURL('image/png');
        setAnnotatedImages(prev => ({
          ...prev,
          [currentPageIndex]: { 
            imageData: currentPageImage,
            annotatedAreas: prev[currentPageIndex]?.annotatedAreas || []
          }
        }));
        
        // Update the pagesToExport with the latest canvas state
        pagesToExport[currentPageIndex] = currentPageImage;
      }
      
      // For large documents, process in batches for better UX
      const batchSize = 5;
      const totalBatches = Math.ceil(pagesToExport.length / batchSize);
      
      let allResults = [];
      
      for (let batch = 0; batch < totalBatches; batch++) {
        const start = batch * batchSize;
        const end = Math.min(start + batchSize, pagesToExport.length);
        const batchImages = pagesToExport.slice(start, end);
        
        const response = await fetch('/api/process', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            images: batchImages,
            batchIndex: batch,
            isFinalBatch: batch === totalBatches - 1
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to process batch');
        }
        
        const data = await response.json();
        allResults.push(data);
        
        // Update progress
        setExportProgress(Math.round(((batch + 1) / totalBatches) * 100));
      }
      
      // If only one batch was processed, use its PDF URL
      // Otherwise, we need to merge PDFs (handled by the backend in the last batch)
      const finalResult = allResults[allResults.length - 1];
      
      // Trigger download
      if (finalResult.pdfUrl) {
        const link = document.createElement('a');
        link.href = finalResult.pdfUrl;
        link.download = 'annotated-document.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
      // Return to annotation after short delay
      setTimeout(() => {
        setCurrentStep('annotate');
      }, 2000);
      
    } catch (error) {
      console.error('Error exporting PDF:', error);
      setExportError(error.message || 'Failed to export annotated PDF');
      
      // Return to annotation after error
      setTimeout(() => {
        setCurrentStep('annotate');
      }, 4000);
    }
  };
  
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
        )}
        
        {currentStep === 'export' && (
          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <h2 className="text-xl font-semibold mb-4">Processing Your PDF</h2>
            
            {exportError ? (
              <div className="text-red-600 mb-4">
                <p className="font-bold">Error</p>
                <p>{exportError}</p>
              </div>
            ) : (
              <>
                <div className="mb-4 w-full">
                  <div className="text-gray-600 mb-1">{exportProgress}% complete</div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-purple-600 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${exportProgress}%` }}
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