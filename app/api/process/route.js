// app/api/process/route.js
import { NextResponse } from 'next/server';
import { writeFile, mkdir, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { existsSync } from 'fs';
import path from 'path';

// Helper to validate and process image data
function processImageData(imageData) {
  if (typeof imageData === 'string' && imageData.startsWith('data:image/')) {
    return imageData.replace(/^data:image\/\w+;base64,/, '');
  }
  return null;
}

// Helper to validate file paths and prevent directory traversal
function validateAndSanitizePath(filePath, basePath) {
  const normalizedPath = path.normalize(filePath);
  const relativePath = path.relative(basePath, normalizedPath);
  
  // Ensure the path doesn't traverse outside the base directory
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Invalid path: Potential directory traversal attack');
  }
  
  return normalizedPath;
}

export async function POST(request) {
  let processDir = null;
  
  try {
    const { images, batchIndex = 0, isFinalBatch = true } = await request.json();

    // Input validation
    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { error: 'No images provided' },
        { status: 400 }
      );
    }

    // Create a unique ID for this process
    const processId = uuidv4();

    // Create directory for the processed files
    processDir = join(process.cwd(), 'public', 'processed', processId);
    await mkdir(processDir, { recursive: true });

    // Process the images - handle both data URLs and server paths
    const imagePromises = images.map(async (imageData, index) => {
      const pageIndex = batchIndex * images.length + index;
      const imagePath = join(processDir, `page-${pageIndex + 1}.png`);

      if (typeof imageData === 'string' && imageData.startsWith('data:image/')) {
        // Handle base64 image data
        const base64Data = processImageData(imageData);
        if (!base64Data) {
          throw new Error(`Invalid image data format for page ${pageIndex + 1}`);
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
        throw new Error(`Invalid image data format for page ${pageIndex + 1}`);
      }

      return imagePath;
    });

    const imagePaths = await Promise.all(imagePromises);

    // Generate PDF using jsPDF
    const pdfName = isFinalBatch ? 'annotated-document.pdf' : `batch-${batchIndex}.pdf`;
    const pdfPath = join(processDir, pdfName);

    try {
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

      // Save the PDF
      const pdfBuffer = await doc.output('arraybuffer');
      await writeFile(pdfPath, Buffer.from(pdfBuffer));

    } catch (error) {
      console.error('Error creating PDF:', error);
      
      // Clean up the process directory if PDF creation failed
      if (processDir) {
        try {
          await rm(processDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error('Error cleaning up process directory:', cleanupError);
        }
      }
      
      return NextResponse.json(
        { error: 'Failed to create PDF. Please try again.' },
        { status: 500 }
      );
    }

    // Return the URL to the generated PDF
    const pdfUrl = `/processed/${processId}/${pdfName}`;

    // Schedule cleanup after a reasonable time (e.g., 30 minutes)
    // This gives the user time to download the file before it's removed
    setTimeout(async () => {
      try {
        if (existsSync(processDir)) {
          await rm(processDir, { recursive: true, force: true });
          console.log(`Cleaned up ${processDir}`);
        }
      } catch (err) {
        console.error('Failed to clean up directory:', err);
      }
    }, 30 * 60 * 1000); // 30 minutes

    return NextResponse.json({
      success: true,
      pdfUrl,
      processId,
      batchIndex
    });

  } catch (error) {
    console.error('Error processing annotations:', error);
    
    // Clean up the process directory if any error occurred
    if (processDir) {
      try {
        await rm(processDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Error cleaning up process directory:', cleanupError);
      }
    }
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}