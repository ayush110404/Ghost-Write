'use client';

import { useState } from 'react';
import { Upload, Card, Typography, Progress, Alert, Button, theme } from 'antd';
import { InboxOutlined, FileOutlined, CheckCircleOutlined, LoadingOutlined, FileTextOutlined } from '@ant-design/icons';
import * as pdfjsLib from 'pdfjs-dist';
import { useDocument } from '@/context/document-context';

const { Dragger } = Upload;
const { Title, Text } = Typography;

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

export default function PdfUploader() {
  const { token } = theme.useToken();
  const { handlePdfUploaded } = useDocument();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [fileName, setFileName] = useState('');

  const processClientSide = async (file: File) => {
    try {
      setStatus('Reading PDF file...');
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      
      setStatus('Loading PDF document...');
      const loadingTask = pdfjsLib.getDocument({
        data,
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

  const handleUpload = async (file: File) => {
    // Validate file size (10MB limit)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage('File size exceeds 10MB limit');
      return Upload.LIST_IGNORE;
    }

    setFileName(file.name);
    setIsProcessing(true);
    setProgress(0);
    setStatus('Initializing...');
    setErrorMessage('');

    try {
      // Try client-side processing first
      const result = await processClientSide(file);
      if (result) {
        // Add some artificial delay to show success state
        setTimeout(() => {
          handlePdfUploaded(result.imageUrls, result.pageCount);
        }, 500);
      }
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
      } catch (serverError: any) {
        console.error('Server-side processing failed:', serverError);
        setErrorMessage(`Failed to process PDF: ${serverError.message}`);
      }
    } finally {
      setIsProcessing(false);
      setStatus('');
    }
    
    return Upload.LIST_IGNORE; // Prevent default upload list UI
  };

  const renderStatusContent = () => {
    if (errorMessage) {
      return (
        <Alert
          message="Upload Failed"
          description={errorMessage}
          type="error"
          showIcon
          className="mb-4"
          closable
          onClose={() => setErrorMessage('')}
          action={
            <Button size="small" danger onClick={() => setErrorMessage('')}>
              Try Again
            </Button>
          }
        />
      );
    }

    if (isProcessing) {
      return (
        <div className="mt-4 sm:mt-6 rounded-lg border shadow-sm p-3 sm:p-4" style={{ 
          backgroundColor: token.colorBgLayout,
          borderColor: token.colorBorderSecondary
        }}>
          <div className="flex items-center gap-2 sm:gap-4 mb-3 sm:mb-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: token.colorInfoBg }}>
              <FileTextOutlined style={{ fontSize: '16px', color: token.colorPrimary }} />
            </div>
            <div className="flex-1 overflow-hidden">
              <Text strong className="block text-ellipsis overflow-hidden whitespace-nowrap text-sm sm:text-base">{fileName}</Text>
              <Text type="secondary" className="text-xs sm:text-sm">{status || 'Processing...'}</Text>
            </div>
            <LoadingOutlined style={{ fontSize: '20px', color: token.colorPrimary }} />
          </div>
          <Progress 
            percent={Math.round(progress)} 
            status="active" 
            strokeColor={token.colorPrimary}
            trailColor={token.colorBgContainer}
            className="mb-0"
          />
        </div>
      );
    }

    return null;
  };

  return (
    <div className="w-full">
      <Card 
        className="border-0 rounded-xl shadow-lg overflow-hidden" 
        styles={{body: { padding: '16px sm:24px' }}}
      >
        {!isProcessing && (
          <>
            <div className="text-center mb-4 sm:mb-6">
              <Title level={3} className="mb-1 sm:mb-2 text-xl sm:text-2xl md:text-3xl">Upload Your PDF Document</Title>
              <Text type="secondary" className="text-sm sm:text-base md:text-lg">
                Drag and drop or select a file to get started
              </Text>
            </div>
            
            <Dragger
              name="file"
              multiple={false}
              accept="application/pdf"
              beforeUpload={handleUpload}
              showUploadList={false}
              disabled={isProcessing}
              className="mb-4 sm:mb-6 border-dashed rounded-xl transition-all duration-300"
              style={{ 
                padding: '24px 16px',
                background: `${token.colorPrimaryBg}`,
                borderColor: token.colorPrimaryBorderHover
              }}
            >
              <div className="p-2 sm:p-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4" style={{ backgroundColor: token.colorInfoBg }}>
                  <InboxOutlined style={{ fontSize: '24px', color: token.colorPrimary }} />
                </div>
                <p className="text-lg sm:text-xl font-medium mb-1 sm:mb-2">
                  Click or drag PDF file here
                </p>
                <p className="text-xs sm:text-sm" style={{ color: token.colorTextSecondary }}>
                  PDF files only (max 10MB)
                </p>
              </div>
            </Dragger>
            
            <div className="p-3 sm:p-4 rounded-lg flex items-start gap-3 mt-3 sm:mt-4" style={{ backgroundColor: token.colorInfoBg }}>
              <div style={{ color: token.colorInfo }}>
                <CheckCircleOutlined />
              </div>
              <div>
                <Text strong style={{ color: token.colorInfoText }}>Privacy First</Text>
                <Text className="block text-xs sm:text-sm" style={{ color: token.colorInfoText }}>
                  Your document will be processed locally in your browser for complete privacy
                </Text>
              </div>
            </div>
          </>
        )}
        
        {renderStatusContent()}
      </Card>
    </div>
  );
}