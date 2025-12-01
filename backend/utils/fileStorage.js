import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { getMediaDirectory, getMediaExtension, generateMediaRelativePath, getMimeType } from '../config/uploadsConfig.js';

/**
 * Check if running in Docker container
 * @returns {boolean}
 */
function isRunningInDocker() {
  // Check for Docker environment file (most reliable method)
  try {
    if (fsSync.existsSync('/.dockerenv')) {
      return true;
    }
  } catch {
    // File system check failed, continue with other methods
  }
  
  // Check environment variable
  if (process.env.DOCKER_CONTAINER === 'true' || process.env.DOCKER_CONTAINER === '1') {
    return true;
  }
  
  // Check if process.cwd() is a Linux absolute path (starts with /) 
  // and we're not on Windows platform
  const cwd = process.cwd();
  if (process.platform !== 'win32' && cwd.startsWith('/')) {
    // Likely in Docker/Linux environment
    return true;
  }
  
  // If we're on Windows but cwd starts with /, we're likely in WSL or Docker
  if (process.platform === 'win32' && cwd.startsWith('/')) {
    return true;
  }
  
  return false;
}

/**
 * Convert Windows absolute path to Docker container path
 * Handles paths like C:\HRIS\backend\uploads\photo\filename.jpg
 * and converts them to /app/uploads/photo/filename.jpg
 * @param {string} filePath - Windows absolute path
 * @returns {string|null} - Docker container path or null if cannot convert
 */
function convertWindowsPathToDockerPath(filePath) {
  if (!filePath) return null;
  
  // Check if it's a Windows absolute path (starts with drive letter like C:\)
  const isWindowsPath = /^[A-Za-z]:\\/.test(filePath);
  if (!isWindowsPath) return null;
  
  // Extract path after drive letter and normalize to forward slashes
  const pathAfterDrive = filePath.replace(/^[A-Za-z]:\\/, '').replace(/\\/g, '/');
  
  // Find "uploads" directory in the path
  const uploadsIndex = pathAfterDrive.toLowerCase().indexOf('uploads');
  if (uploadsIndex === -1) {
    // Try to find media type directories directly
    const mediaTypes = ['photo', 'signature', 'thumb', 'education', 'csc', 'workcert', 'certificate', 'leave'];
    for (const mediaType of mediaTypes) {
      const typeIndex = pathAfterDrive.toLowerCase().indexOf(mediaType);
      if (typeIndex !== -1) {
        // Extract filename
        const parts = pathAfterDrive.split('/');
        const filename = parts[parts.length - 1];
        try {
          const dockerDir = getMediaDirectory(mediaType);
          // Normalize to forward slashes and ensure absolute path
          let normalizedDir = String(dockerDir).replace(/\\/g, '/');
          // Remove any trailing slashes
          normalizedDir = normalizedDir.replace(/\/+$/, '');
          // Ensure leading slash for absolute path
          if (!normalizedDir.startsWith('/')) {
            normalizedDir = '/' + normalizedDir;
          }
          // Construct final path with forward slashes
          return normalizedDir + '/' + filename;
        } catch {
          // Fallback to MEDIA_BASE_DIR - ensure absolute path with forward slashes
          let mediaBaseDir = (process.env.MEDIA_BASE_DIR || '/app/uploads').replace(/\\/g, '/');
          // Remove any trailing slashes
          mediaBaseDir = mediaBaseDir.replace(/\/+$/, '');
          // Ensure leading slash
          if (!mediaBaseDir.startsWith('/')) {
            mediaBaseDir = '/' + mediaBaseDir;
          }
          return mediaBaseDir + '/' + mediaType + '/' + filename;
        }
      }
    }
    return null;
  }
  
  // Extract relative path from "uploads" onwards
  const relativePath = pathAfterDrive.substring(uploadsIndex);
  // relativePath is now like "uploads/photo/filename.jpg"
  
  // Extract media type and filename
  const pathParts = relativePath.split('/');
  if (pathParts.length < 3) return null; // Should be "uploads/type/filename"
  
  const mediaType = pathParts[1]; // "photo", "signature", "thumb", etc.
  const filename = pathParts[2];
  
  // Use getMediaDirectory to get the correct Docker container path
  try {
    const dockerDir = getMediaDirectory(mediaType);
    // Normalize to forward slashes and ensure absolute path
    let normalizedDir = String(dockerDir).replace(/\\/g, '/');
    // Remove any trailing slashes
    normalizedDir = normalizedDir.replace(/\/+$/, '');
    // Ensure leading slash for absolute path
    if (!normalizedDir.startsWith('/')) {
      normalizedDir = '/' + normalizedDir;
    }
    // Construct final path with forward slashes
    const finalPath = normalizedDir + '/' + filename;
    return finalPath;
  } catch {
    // Fallback to MEDIA_BASE_DIR - ensure absolute path with forward slashes
    let mediaBaseDir = (process.env.MEDIA_BASE_DIR || '/app/uploads').replace(/\\/g, '/');
    // Remove any trailing slashes
    mediaBaseDir = mediaBaseDir.replace(/\/+$/, '');
    // Ensure leading slash
    if (!mediaBaseDir.startsWith('/')) {
      mediaBaseDir = '/' + mediaBaseDir;
    }
    return mediaBaseDir + '/' + mediaType + '/' + filename;
  }
}

/**
 * Resolve file path, handling Windows absolute paths in Docker containers
 * @param {string} filePath - File path (can be Windows absolute, Linux absolute, or relative)
 * @returns {string} - Resolved path for Docker container
 */
function resolveFilePath(filePath) {
  if (!filePath) return null;
  
  // Check if it's a Windows absolute path
  const isWindowsPath = /^[A-Za-z]:\\/.test(filePath);
  if (isWindowsPath) {
    // Only convert to Docker path if we're actually running in Docker
    const inDocker = isRunningInDocker();
    if (inDocker) {
      const dockerPath = convertWindowsPathToDockerPath(filePath);
      if (dockerPath) {
        // Final normalization to ensure Linux absolute path
        let normalized = String(dockerPath).replace(/\\/g, '/');
        // Ensure leading slash
        if (!normalized.startsWith('/')) {
          normalized = '/' + normalized;
        }
        console.log(`🔄 Converted Windows path: ${filePath} → ${normalized}`);
        return normalized;
      }
      // If conversion fails in Docker, return null instead of falling through
      // This prevents Windows paths from being incorrectly treated as relative paths
      console.warn(`⚠️ Could not convert Windows path: ${filePath}`);
      return null;
    } else {
      // Running locally on Windows - use the Windows path as-is
      return filePath;
    }
  }
  
  // Handle Linux/Unix absolute paths (starts with /)
  if (filePath.startsWith('/')) {
    // Ensure forward slashes
    return filePath.replace(/\\/g, '/');
  }
  
  // Handle relative paths
  const normalizedPath = filePath.replace(/\\/g, '/');
  const joinedPath = path.join(process.cwd(), normalizedPath);
  // Normalize path separators: use forward slashes in Docker, platform-specific otherwise
  const inDocker = isRunningInDocker();
  if (inDocker) {
    return joinedPath.replace(/\\/g, '/');
  }
  return joinedPath;
}

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
 * @param {string} filePath - File path (can be Windows absolute, Linux absolute, or relative)
 */
export async function deleteMediaFile(filePath) {
  if (!filePath) return;

  try {
    const fullPath = resolveFilePath(filePath);
    if (!fullPath) {
      console.warn(`⚠️ Could not resolve path for deletion: ${filePath}`);
      return;
    }
    
    await fs.unlink(fullPath);
    console.log(`🗑️ Deleted old file: ${filePath} (${fullPath})`);
  } catch (error) {
    console.warn(`⚠️ Could not delete file ${filePath}:`, error.message);
  }
}

/**
 * Check if file exists
 * @param {string} filePath - File path (can be Windows absolute, Linux absolute, or relative)
 * @returns {boolean}
 */
export async function fileExists(filePath) {
  if (!filePath) return false;

  try {
    const fullPath = resolveFilePath(filePath);
    if (!fullPath) return false;
    
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read media file as base64
 * @param {string} filePath - File path (can be Windows absolute, Linux absolute, or relative)
 * @returns {string} - Base64 data URL
 */
export async function readMediaAsBase64(filePath) {
  if (!filePath) {
    return null;
  }

  try {
    const fullPath = resolveFilePath(filePath);
    if (!fullPath) {
      console.warn(`⚠️ Could not resolve path: ${filePath}`);
      return null;
    }
    
    const buffer = await fs.readFile(fullPath);
    
    const extension = path.extname(filePath);
    const mimeType = getMimeType(extension);
    
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.warn(`⚠️ Could not read file ${filePath}:`, error.message);
    // Only log attempted path if it's different from the input
    const attemptedPath = resolveFilePath(filePath);
    if (attemptedPath && attemptedPath !== filePath) {
      console.warn(`⚠️ Full path attempted: ${attemptedPath}`);
    }
    return null;
  }
}
