'use client';

import { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import Error from 'next/error';
import { useDocument } from '@/context/document-context';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

export default function PdfUploader() {
  const {handlePdfUploaded} =  useDocument()
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');

  const processClientSide = async (file:File) => {
    try {
      setStatus('Reading PDF file...');
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      
      setStatus('Loading PDF document...');
      const loadingTask = pdfjsLib.getDocument({
        data,
        // standardFontDataUrl: pdfjsLib.GlobalWorkerOptions.standardFontDataUrl,
        useSystemFonts: true,
        useWorkerFetch: true
      });
      
      const pdfDoc = await loadingTask.promise;
      const totalPages = pdfDoc.numPages;
      const imageUrls = [];

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        setStatus(`Converting page ${pageNum} of ${totalPages}`);
        setProgress((pageNum / totalPages) * 100);

        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });

        // Create canvas with white background
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        if(!context) return;

        // Set white background
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Render PDF page to canvas
        await page.render({
          canvasContext: context,
          viewport: viewport,
          intent: 'display'
        }).promise;

        // Convert canvas to blob
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png', 0.95));
        if (blob) {
          imageUrls.push(URL.createObjectURL(blob));
        }
      }

      setStatus('Processing complete!');
      return { imageUrls, pageCount: totalPages };
    } catch (error) {
      console.error('Error in client-side processing:', error);
      throw error;
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement> ) => {
    if (!event.target.files) return;
    const file = event.target.files[0];
    
    // Validate file type
    if (file.type !== 'application/pdf') {
      alert('Please select a valid PDF file');
      return;
    }

    // Validate file size (10MB limit)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      alert('File size exceeds 10MB limit');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setStatus('Initializing...');

    try {
      // Try client-side processing first
      const result = await processClientSide(file);
      if (result) handlePdfUploaded(result.imageUrls, result.pageCount);
    } catch (error) {
      console.warn('Client-side processing failed, falling back to server:', error);
      setStatus('Falling back to server processing...');
      
      // Fall back to server-side processing
      const formData = new FormData();
      formData.append('pdf', file);

      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload failed');
        }

        const data = await response.json();
        handlePdfUploaded(data.imageUrls, data.pageCount);
      } catch (serverError:any) {
        console.error('Server-side processing failed:', serverError);
        alert(`Failed to process PDF: ${serverError.message}`);
      }
    } finally {
      setIsProcessing(false);
      setStatus('');
    }
  };

  return (
    <div className="w-full p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Upload PDF Document</h2>
      <div className="flex items-center justify-center w-full">
        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <svg className="w-10 h-10 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="mb-2 text-sm text-gray-500">
              <span className="font-semibold">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-gray-500">PDF files only (max 10MB)</p>
          </div>
          <input
            type="file"
            className="hidden"
            accept="application/pdf"
            onChange={handleFileChange}
            disabled={isProcessing}
          />
        </label>
      </div>

      {isProcessing && (
        <div className="mt-4">
          <p className="text-sm text-gray-600 mb-1">{status || 'Processing...'}</p>
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}