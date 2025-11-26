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
 * @param {string} photoPath - Photo path in various formats
 * @returns {string|null} Full photo URL or null if no path provided
 */
export const getPhotoUrl = (photoPath) => {
  if (!photoPath) {
    return null;
  }
  
  // If already a full URL, return as is
  if (photoPath.startsWith('http://') || photoPath.startsWith('https://')) {
    return photoPath;
  }
  
  // If absolute Windows path, extract filename and construct URL
  if (photoPath.includes('\\') && (photoPath.startsWith('C:') || photoPath.startsWith('D:') || photoPath.startsWith('E:'))) {
    const pathParts = photoPath.split('\\');
    const filename = pathParts[pathParts.length - 1];
    return getUploadsUrl(`photo/${filename}`);
  }
  
  // If starts with uploads/, remove the prefix and construct URL
  if (photoPath.startsWith('uploads/')) {
    const relativePath = photoPath.replace('uploads/', '');
    return getUploadsUrl(relativePath);
  }
  
  // If starts with /uploads/, remove the prefix and construct URL
  if (photoPath.startsWith('/uploads/')) {
    const relativePath = photoPath.replace('/uploads/', '');
    return getUploadsUrl(relativePath);
  }
  
  // Otherwise, assume it's a filename or relative path and prepend photo/ if needed
  if (photoPath.includes('/')) {
    // Already has a path structure
    return getUploadsUrl(photoPath);
  } else {
    // Just a filename, assume it's in photo directory
    return getUploadsUrl(`photo/${photoPath}`);
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

