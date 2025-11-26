import fs from 'fs/promises';
import path from 'path';
import { getMediaDirectory, getMediaExtension, generateMediaRelativePath, getMimeType } from '../config/uploadsConfig.js';

/**
 * Save media file to appropriate directory
 * @param {Buffer} buffer - Image buffer
 * @param {string} type - 'signature', 'photo', or 'thumb'
 * @param {string} employeeObjId - Employee unique ID
 * @returns {string} - Relative file path
 */
export async function saveMediaFile(buffer, type, employeeObjId) {
  if (!buffer || !type || !employeeObjId) {
    throw new Error('Missing required parameters');
  }

  const directory = getMediaDirectory(type);
  const extension = getMediaExtension(type);
  
  // Ensure directory exists
  await fs.mkdir(directory, { recursive: true });

  const filename = `${employeeObjId}.${extension}`;
  const filePath = path.join(directory, filename);
  const relativePath = generateMediaRelativePath(employeeObjId, type);

  console.log(`💾 Saving ${type} file for employee objid: ${employeeObjId}`);
  console.log(`💾 Filename: ${filename}`);
  console.log(`💾 Full path: ${filePath}`);
  await fs.writeFile(filePath, buffer);
  console.log(`✅ Saved ${type} successfully as ${filename}`);

  // Return absolute path instead of relative path
  return filePath;
}

/**
 * Delete old media file
 * @param {string} filePath - Relative file path
 */
export async function deleteMediaFile(filePath) {
  if (!filePath) return;

  try {
    let fullPath;
    if (path.isAbsolute(filePath)) {
      // If it's already an absolute path, use it directly
      fullPath = filePath;
    } else {
      // If it's a relative path, join with process.cwd()
      // Normalize path separators for cross-platform compatibility
      const normalizedPath = filePath.replace(/\\/g, '/');
      fullPath = path.join(process.cwd(), normalizedPath);
    }
    
    await fs.unlink(fullPath);
    console.log(`🗑️ Deleted old file: ${filePath}`);
  } catch (error) {
    console.warn(`⚠️ Could not delete file ${filePath}:`, error.message);
  }
}

/**
 * Check if file exists
 * @param {string} filePath - Relative file path
 * @returns {boolean}
 */
export async function fileExists(filePath) {
  if (!filePath) return false;

  try {
    let fullPath;
    if (path.isAbsolute(filePath)) {
      // If it's already an absolute path, use it directly
      fullPath = filePath;
    } else {
      // If it's a relative path, join with process.cwd()
      // Normalize path separators for cross-platform compatibility
      const normalizedPath = filePath.replace(/\\/g, '/');
      fullPath = path.join(process.cwd(), normalizedPath);
    }
    
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read media file as base64
 * @param {string} filePath - Relative file path
 * @returns {string} - Base64 data URL
 */
export async function readMediaAsBase64(filePath) {
  if (!filePath) {
    return null;
  }

  try {
    // Handle both absolute and relative paths
    let fullPath;
    if (path.isAbsolute(filePath)) {
      // If it's already an absolute path, use it directly
      fullPath = filePath;
    } else {
      // If it's a relative path, join with process.cwd()
      // Normalize path separators for cross-platform compatibility
      const normalizedPath = filePath.replace(/\\/g, '/');
      fullPath = path.join(process.cwd(), normalizedPath);
    }
    
    const buffer = await fs.readFile(fullPath);
    
    const extension = path.extname(filePath);
    const mimeType = getMimeType(extension);
    
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.warn(`⚠️ Could not read file ${filePath}:`, error.message);
    console.warn(`⚠️ Full path attempted:`, path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath));
    return null;
  }
}
