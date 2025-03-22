// components/PdfProcessor.jsx
'use client';

import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export default function PdfProcessor({ file, onProcessed }) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('initializing');
  const abortControllerRef = useRef(new AbortController());

  useEffect(() => {
    if (!file) return;

    const processPdf = async () => {
      try {
        setStatus('loading');
        
        // Load the PDF document
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pageCount = pdf.numPages;
        
        setStatus('processing');
        
        // Process each page
        const processedPages = [];
        for (let i = 1; i <= pageCount; i++) {
          // Check if processing was aborted
          if (abortControllerRef.current.signal.aborted) {
            throw new Error('PDF processing aborted');
          }
          
          // Render page to canvas
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          await page.render({
            canvasContext: context,
            viewport: viewport
          }).promise;
          
          // Store the page data
          const imageUrl = canvas.toDataURL('image/png');
          processedPages.push({
            pageNumber: i,
            imageUrl,
            dimensions: {
              width: viewport.width,
              height: viewport.height
            }
          });
          
          // Update progress
          setProgress((i / pageCount) * 100);
        }
        
        setStatus('complete');
        onProcessed(processedPages);
        
      } catch (error) {
        console.error('Error processing PDF:', error);
        setStatus('error');
      }
    };
    
    processPdf();
    
    // Cleanup function
    return () => {
      abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();
    };
  }, [file, onProcessed]);

  return (
    <div className="w-full">
      <div className="text-center mb-2">
        {status === 'loading' && <p>Loading PDF document...</p>}
        {status === 'processing' && <p>Processing pages: {Math.round(progress)}%</p>}
        {status === 'error' && <p className="text-red-500">Error processing PDF. Please try again.</p>}
      </div>
      
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// Function to combine annotated images back into a PDF
export async function combineIntoPdf(annotatedPages) {
  try {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Add each annotated image as a page
    for (const page of annotatedPages) {
      // Convert data URL to bytes
      const imageData = page.imageData.split(',')[1];
      const imageBytes = Uint8Array.from(atob(imageData), c => c.charCodeAt(0));
      
      // Embed the image in the PDF
      const pngImage = await pdfDoc.embedPng(imageBytes);
      
      // Add a page with the same dimensions as the image
      const pdfPage = pdfDoc.addPage([
        pngImage.width,
        pngImage.height
      ]);
      
      // Draw the image on the page
      pdfPage.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: pngImage.width,
        height: pngImage.height
      });
    }
    
    // Serialize the PDF to bytes
    const pdfBytes = await pdfDoc.save();
    
    // Convert to blob and create URL
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    return url;
  } catch (error) {
    console.error('Error combining images into PDF:', error);
    throw error;
  }
}