import sharp from 'sharp';
import bmp from 'bmp-js';

export const MAX_BYTES = 100 * 1024; // 100KB default
export const MAX_PHOTO_BYTES = 150 * 1024; // 150KB for photos
export const MAX_SIGNATURE_BYTES = 150 * 1024; // 150KB for signatures and thumbmarks

/**
 * Normalize signature colors: dark pixels to black, light pixels to white
 * @param {Buffer} rgbaBuffer - Raw RGBA buffer
 * @returns {Buffer} - Transformed RGBA buffer
 */
function normalizeSignatureColors(rgbaBuffer) {
  const buffer = Buffer.from(rgbaBuffer);
  
  // First pass: analyze the image to determine optimal threshold
  let totalBrightness = 0;
  let pixelCount = 0;
  
  for (let i = 0; i < buffer.length; i += 4) {
    const r = buffer[i];
    const g = buffer[i + 1];
    const b = buffer[i + 2];
    const a = buffer[i + 3];
    
    // Only consider non-transparent pixels
    if (a > 128) {
      const brightness = (r + g + b) / 3;
      totalBrightness += brightness;
      pixelCount++;
    }
  }
  
  // Calculate adaptive threshold based on image content
  const avgBrightness = pixelCount > 0 ? totalBrightness / pixelCount : 128;
  const threshold = Math.max(100, Math.min(180, avgBrightness)); // Adaptive threshold
  
  console.log(`🎨 Color normalization: avg brightness ${avgBrightness.toFixed(1)}, threshold ${threshold}`);
  
  // Second pass: apply color normalization
  for (let i = 0; i < buffer.length; i += 4) {
    const r = buffer[i];
    const g = buffer[i + 1];
    const b = buffer[i + 2];
    const a = buffer[i + 3];
    
    // Calculate brightness with weighted RGB values (human eye sensitivity)
    const brightness = (r * 0.299 + g * 0.587 + b * 0.114);
    
    // If pixel is dark (signature), make it black
    // If pixel is light (background), make it white
    if (brightness < threshold) {
      buffer[i] = 0;     // R = black
      buffer[i + 1] = 0; // G = black
      buffer[i + 2] = 0; // B = black
    } else {
      buffer[i] = 255;     // R = white
      buffer[i + 1] = 255; // G = white
      buffer[i + 2] = 255; // B = white
    }
    // Keep alpha channel unchanged
  }
  
  return buffer;
}

function encodeBmpFromRgba(rawRgbaBuffer, width, height) {
  const bmpData = {
    data: rawRgbaBuffer,
    width,
    height
  };
  const encoded = bmp.encode(bmpData);
  return Buffer.from(encoded.data);
}

/**
 * Compress and resize images to meet specified size limits and formats
 * Supports JPEG (for photos), PNG (for signatures/thumbmarks), and BMP (legacy)
 * @param {Buffer} inputBuffer - Input image buffer
 * @param {Object} options - Compression options
 * @returns {Object} - { buffer, width, height, bytes }
 */
export async function toBmpUnder100KB(inputBuffer, options = {}) {
  const {
    initialMaxWidth = 600,
    initialMaxHeight = 600,
    minWidth = 32,
    minHeight = 32,
    stepScale = 0.8,
    normalizeColors = false,  // For signatures: convert to black/white
    maintainQuality = false,   // For photos: use better resize algorithm
    useCompressedFormat = false,  // For photos: use JPEG instead of BMP
    maxBytes = MAX_BYTES,     // Configurable file size limit
    usePngFormat = false      // Use PNG instead of BMP for signatures/thumbmarks
  } = options;

  try {
    // Probe original
    const image = sharp(inputBuffer, { failOnError: false });
    const metadata = await image.metadata();
    let targetWidth = Math.min(metadata.width || initialMaxWidth, initialMaxWidth);
    let targetHeight = Math.min(metadata.height || initialMaxHeight, initialMaxHeight);

    console.log(`🖼️ Original image: ${metadata.width}x${metadata.height}, starting compression at ${targetWidth}x${targetHeight}`);

    // Iteratively downscale until size < 100KB or min size reached
    for (let i = 0; i < 25; i++) {
      // Configure resize options based on quality settings
      const resizeOptions = {
        width: Math.round(targetWidth),
        height: Math.round(targetHeight),
        fit: 'inside',
        withoutEnlargement: true
      };

      // Use better kernel for quality preservation
      if (maintainQuality) {
        resizeOptions.kernel = sharp.kernel.lanczos3; // High quality
        resizeOptions.position = 'center'; // Better positioning
      }

      let processedBuffer;
      
      if (useCompressedFormat) {
        // Use JPEG compression for photos
        const jpegOptions = {
          quality: maintainQuality ? 90 : 80,  // High quality for photos
          progressive: true,
          mozjpeg: true  // Use mozjpeg encoder for better quality
        };
        
        processedBuffer = await sharp(inputBuffer, { failOnError: false })
          .resize(resizeOptions)
          .jpeg(jpegOptions)
          .toBuffer();
      } else if (usePngFormat) {
        // Use PNG for signatures and thumbmarks
        const pngOptions = {
          compressionLevel: 6,
          adaptiveFiltering: true,
          force: true
        };
        
        processedBuffer = await sharp(inputBuffer, { failOnError: false })
          .resize(resizeOptions)
          .png(pngOptions)
          .toBuffer();
        
        console.log(`🖼️ PNG processed - output size: ${processedBuffer.byteLength} bytes`);
      } else {
        // Use BMP for signatures (legacy support)
        const resized = await sharp(inputBuffer, { failOnError: false })
          .resize(resizeOptions)
          .raw()
          .toBuffer({ resolveWithObject: true });

        // Apply color transformation for signatures
        let processedData = resized.data;
        if (normalizeColors) {
          processedData = normalizeSignatureColors(resized.data);
        }

        processedBuffer = encodeBmpFromRgba(processedData, resized.info.width, resized.info.height);
      }

      console.log(`🔄 Attempt ${i + 1}: ${targetWidth}x${targetHeight} = ${processedBuffer.byteLength} bytes (${(processedBuffer.byteLength/1024).toFixed(1)}KB)`);

      if (processedBuffer.byteLength <= maxBytes) {
        console.log(`✅ Success: Final size ${processedBuffer.byteLength} bytes (${(processedBuffer.byteLength/1024).toFixed(1)}KB, limit: ${(maxBytes/1024).toFixed(1)}KB)`);
        return { buffer: processedBuffer, width: targetWidth, height: targetHeight, bytes: processedBuffer.byteLength };
      }

      // Reduce dimensions - much less aggressive for quality mode
      const scaleFactor = maintainQuality ? 0.95 : stepScale; // Much less aggressive scaling
      targetWidth = Math.max(Math.round(targetWidth * scaleFactor), minWidth);
      targetHeight = Math.max(Math.round(targetHeight * scaleFactor), minHeight);

      if (targetWidth <= minWidth && targetHeight <= minHeight) {
        console.log(`⚠️ Reached minimum size ${targetWidth}x${targetHeight}, returning ${processedBuffer.byteLength} bytes`);
        // Return the smallest possible even if it exceeds MAX_BYTES
        return { buffer: processedBuffer, width: targetWidth, height: targetHeight, bytes: processedBuffer.byteLength };
      }
    }

    // Fallback: encode once at minimal size
    console.log(`🔄 Final fallback: ${minWidth}x${minHeight}`);
    const resizeOptions = {
      width: minWidth,
      height: minHeight,
      fit: 'inside',
      withoutEnlargement: true
    };
    
    if (maintainQuality) {
      resizeOptions.kernel = sharp.kernel.lanczos3;
      resizeOptions.position = 'center';
    }

    let fallbackBuffer;
    
    if (useCompressedFormat) {
      // Use JPEG compression for photos
      const jpegOptions = {
        quality: maintainQuality ? 90 : 80,
        progressive: true,
        mozjpeg: true
      };
      
      fallbackBuffer = await sharp(inputBuffer, { failOnError: false })
        .resize(resizeOptions)
        .jpeg(jpegOptions)
        .toBuffer();
    } else if (usePngFormat) {
      // Use PNG for signatures and thumbmarks
      const pngOptions = {
        compressionLevel: 6,
        adaptiveFiltering: true,
        force: true
      };
      
      fallbackBuffer = await sharp(inputBuffer, { failOnError: false })
        .resize(resizeOptions)
        .png(pngOptions)
        .toBuffer();
      
      console.log(`🖼️ PNG fallback processed - output size: ${fallbackBuffer.byteLength} bytes`);
    } else {
      // Use BMP for signatures (legacy support)
      const fallback = await sharp(inputBuffer, { failOnError: false })
        .resize(resizeOptions)
        .raw()
        .toBuffer({ resolveWithObject: true });

      let processedData = fallback.data;
      if (normalizeColors) {
        processedData = normalizeSignatureColors(fallback.data);
      }

      fallbackBuffer = encodeBmpFromRgba(processedData, fallback.info.width, fallback.info.height);
    }
    
    console.log(`⚠️ Fallback result: ${minWidth}x${minHeight} = ${fallbackBuffer.byteLength} bytes (${(fallbackBuffer.byteLength/1024).toFixed(1)}KB)`);
    return { buffer: fallbackBuffer, width: minWidth, height: minHeight, bytes: fallbackBuffer.byteLength };
  } catch (error) {
    console.error('❌ Error in toBmpUnder100KB:', error);
    // Return a minimal 1x1 black BMP as fallback
    const minimalBmp = Buffer.from([
      0x42, 0x4D, 0x3E, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3E, 0x00, 0x00, 0x00,
      0x28, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00,
      0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);
    return { buffer: minimalBmp, width: 1, height: 1, bytes: minimalBmp.byteLength };
  }
}


