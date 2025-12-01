// frontend/src/utils/urls.js
// Centralized URL construction utilities using environment variables

/**
 * Get the base API URL from environment variable
 * @returns {string} Base API URL
 */
export const getApiBaseUrl = () => {
  return import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
};

/**
 * Get the base uploads URL from environment variable
 * @returns {string} Base uploads URL
 */
export const getUploadsBaseUrl = () => {
  return import.meta.env.VITE_UPLOADS_URL || 'http://localhost:5000/uploads';
};

/**
 * Construct a full API URL from a path
 * @param {string} path - API endpoint path (e.g., '/auth/login' or 'auth/login')
 * @returns {string} Full API URL
 */
export const getApiUrl = (path) => {
  const baseUrl = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
};

/**
 * Construct a full uploads URL from a path
 * @param {string} path - Upload path (e.g., 'photo/image.jpg' or '/photo/image.jpg')
 * @returns {string} Full uploads URL
 */
export const getUploadsUrl = (path) => {
  if (!path) {
    return null;
  }
  
  const baseUrl = getUploadsBaseUrl();
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${baseUrl}/${cleanPath}`;
};

/**
 * Get photo URL - handles different photo path formats
 * This is a centralized function to replace all getPhotoUrl implementations
 * @param {string|number} photoPath - Photo path in various formats, or pathid (integer), or base64 data URL
 * @returns {string|null} Full photo URL or base64 data URL or null if no path provided
 */
export const getPhotoUrl = (photoPath) => {
  if (!photoPath && photoPath !== 0) {
    return null;
  }
  
  // Handle pathid (integer) - backend should convert this to base64, but if we receive it, return null
  // The backend should be sending base64 data URLs instead of pathids
  if (typeof photoPath === 'number') {
    console.warn('⚠️ Received pathid (number) instead of photo path. Backend should convert to base64.');
    return null;
  }
  
  // Convert to string if not already
  const photoPathStr = String(photoPath);
  
  // If it's a base64 data URL, return as is
  if (photoPathStr.startsWith('data:image/')) {
    return photoPathStr;
  }
  
  // If already a full URL, return as is
  if (photoPathStr.startsWith('http://') || photoPathStr.startsWith('https://')) {
    return photoPathStr;
  }
  
  // If absolute Windows path, extract filename and construct URL
  if (photoPathStr.includes('\\') && (photoPathStr.startsWith('C:') || photoPathStr.startsWith('D:') || photoPathStr.startsWith('E:'))) {
    const pathParts = photoPathStr.split('\\');
    const filename = pathParts[pathParts.length - 1];
    return getUploadsUrl(`photo/${filename}`);
  }
  
  // If starts with uploads/, remove the prefix and construct URL
  if (photoPathStr.startsWith('uploads/')) {
    const relativePath = photoPathStr.replace('uploads/', '');
    return getUploadsUrl(relativePath);
  }
  
  // If starts with /uploads/, remove the prefix and construct URL
  if (photoPathStr.startsWith('/uploads/')) {
    const relativePath = photoPathStr.replace('/uploads/', '');
    return getUploadsUrl(relativePath);
  }
  
  // Otherwise, assume it's a filename or relative path and prepend photo/ if needed
  if (photoPathStr.includes('/')) {
    // Already has a path structure
    return getUploadsUrl(photoPathStr);
  } else {
    // Just a filename, assume it's in photo directory
    return getUploadsUrl(`photo/${photoPathStr}`);
  }
};

/**
 * Get the current base URL from the browser
 * @returns {string} Current base URL
 */
export const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.host}`;
  }
  return getApiBaseUrl().replace('/api', '');
};

