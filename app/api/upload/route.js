// app/api/upload/route.js
import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import * as pdfjsLib from 'pdfjs-dist';
import { createCanvas } from 'canvas';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// Initialize PDF.js worker and configure standard fonts
if (typeof window === 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = require('pdfjs-dist/build/pdf.worker.entry');
  
  // Configure standard font data URL using local path
  const STANDARD_FONT_DATA_URL = join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/');
  pdfjsLib.GlobalWorkerOptions.standardFontDataUrl = STANDARD_FONT_DATA_URL;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const pdfFile = formData.get('pdf');
    
    if (!pdfFile) {
      return NextResponse.json(
        { error: 'No PDF file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (pdfFile.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDFs are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size (10MB limit)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (pdfFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 400 }
      );
    }
    
    // Create a unique ID for this upload
    const uploadId = uuidv4();
    
    // Create upload directory
    const uploadDir = join(process.cwd(), 'public', 'uploads', uploadId);
    await mkdir(uploadDir, { recursive: true });
    
    // Create images directory
    const imageDir = join(uploadDir, 'images');
    await mkdir(imageDir, { recursive: true });

    try {
      // Convert file to buffer
      const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
      
      // Load the PDF document
      const data = new Uint8Array(pdfBuffer);
      const loadingTask = pdfjsLib.getDocument({
        data,
        standardFontDataUrl: pdfjsLib.GlobalWorkerOptions.standardFontDataUrl,
        useSystemFonts: true,
        useWorkerFetch: true,
        verbosity: 0 // Reduce console warnings
      });
      
      const pdfDoc = await loadingTask.promise;
      const imageUrls = [];

      // Set quality parameters
      const SCALE = 2.0;
      const IMAGE_QUALITY = 0.9;

      // Convert each page to an image
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: SCALE });

        // Create canvas for rendering
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');
        
        // Set white background
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Render PDF page to canvas with error handling
        try {
          await page.render({
            canvasContext: context,
            viewport: viewport,
            intent: 'display'
          }).promise;
        } catch (renderError) {
          console.error(`Error rendering page ${pageNum}:`, renderError);
          continue; // Skip failed page but continue processing
        }

        // Create safe filename
        const filename = `page-${String(pageNum).padStart(3, '0')}.png`;
        
        // Sanitize the file path to prevent path traversal attacks
        const safePath = path.normalize(filename).replace(/^(\.\.(\/|\\|$))+/, '');
        const imagePath = join(imageDir, safePath);
        
        // Save canvas as PNG
        const buffer = canvas.toBuffer('image/png', { 
          quality: IMAGE_QUALITY,
          compressionLevel: 6
        });
        await writeFile(imagePath, buffer);

        // Create a safe URL
        const safeUrl = `/uploads/${uploadId}/images/${safePath}`;
        imageUrls.push(safeUrl);
      }

      // Return only what's needed
      return NextResponse.json({
        success: true,
        pageCount: imageUrls.length,
        imageUrls
      });

    } catch (error) {
      console.error('Error converting PDF to images:', error);
      return NextResponse.json(
        { error: 'Failed to convert PDF to images' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error processing upload:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}