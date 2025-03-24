import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { existsSync } from 'fs';
import path from 'path';

// Helper to validate and process image data
function processImageData(imageData:string) {
  if (typeof imageData === 'string' && imageData.startsWith('data:image/')) {
    return imageData.replace(/^data:image\/\w+;base64,/, '');
  }
  return null;
}

// Helper to validate file paths and prevent directory traversal
function validateAndSanitizePath(filePath:string, basePath:string) {
  const normalizedPath = path.normalize(filePath);
  const relativePath = path.relative(basePath, normalizedPath);
  
  // Ensure the path doesn't traverse outside the base directory
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Invalid path: Potential directory traversal attack');
  }
  
  return normalizedPath;
}

export async function POST(request:NextRequest) {
  let tempDir:any = null;
  
  try {
    const { images, filename = 'annotated-document.pdf' } = await request.json();

    // Input validation
    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { error: 'No images provided' },
        { status: 400 }
      );
    }

    // Create a unique ID for this process
    const processId = uuidv4();

    // Create temporary directory for processing
    tempDir = join(process.cwd(), 'tmp', processId);
    await mkdir(tempDir, { recursive: true });

    // Process the images - handle both data URLs and server paths
    const imagePromises = images.map(async (imageData, index) => {
      const imagePath = join(tempDir, `page-${index + 1}.png`);

      if (typeof imageData === 'string' && imageData.startsWith('data:image/')) {
        // Handle base64 image data
        const base64Data = processImageData(imageData);
        if (!base64Data) {
          throw new Error(`Invalid image data format for page ${index + 1}`);
        }
        await writeFile(imagePath, base64Data, 'base64');
      } else if (typeof imageData === 'string' && imageData.startsWith('/')) {
        // Handle path to existing image - with path validation
        try {
          const publicDir = join(process.cwd(), 'public');
          const sourcePath = validateAndSanitizePath(
            join(publicDir, imageData.slice(1)), 
            publicDir
          );
          
          if (existsSync(sourcePath)) {
            const imageBuffer = await readFile(sourcePath);
            await writeFile(imagePath, imageBuffer);
          } else {
            throw new Error(`Source image not found: ${sourcePath}`);
          }
        } catch (error) {
          console.error('Error copying existing image:', error);
          throw error;
        }
      } else {
        throw new Error(`Invalid image data format for page ${index + 1}`);
      }

      return imagePath;
    });

    const imagePaths = await Promise.all(imagePromises);

    // Import dynamically to reduce initial load time
    const { jsPDF } = await import('jspdf');
    const { createCanvas, loadImage } = await import('canvas');

    // Create PDF document
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
    });

    // Add each image to the PDF
    for (let i = 0; i < imagePaths.length; i++) {
      const img = await loadImage(imagePaths[i]);
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Convert to JPEG for better PDF compatibility
      const imgData = canvas.toDataURL('image/jpeg', 0.95);

      // Add a new page for all but the first image
      if (i > 0) {
        doc.addPage();
      }

      // Calculate dimensions to fit the page while maintaining aspect ratio
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      const imgWidth = img.width;
      const imgHeight = img.height;
      
      const ratio = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);
      const finalWidth = imgWidth * ratio;
      const finalHeight = imgHeight * ratio;
      
      // Center the image on the page
      const x = (pageWidth - finalWidth) / 2;
      const y = (pageHeight - finalHeight) / 2;

      // Add the image to the PDF
      doc.addImage(imgData, 'JPEG', x, y, finalWidth, finalHeight);
    }

    // Generate PDF as a buffer
    const pdfBuffer = Buffer.from(await doc.output('arraybuffer'));

    // Clean up temporary files
    await rm(tempDir, { recursive: true, force: true });

    // Create a response with the PDF file for direct download
    const response = new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString()
      }
    });

    return response;

  } catch (error:any) {
    console.error('Error processing annotations:', error);
    
    // Clean up the temporary directory if any error occurred
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Error cleaning up temporary directory:', cleanupError);
      }
    }
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}