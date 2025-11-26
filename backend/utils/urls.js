// backend/utils/urls.js
// Centralized URL construction utilities using environment variables

/**
 * Get the base API URL from environment variable
 * @returns {string} Base API URL
 */
export const getApiBaseUrl = () => {
  return process.env.API_BASE_URL || 'http://localhost:5000';
};

/**
 * Get the base uploads URL from environment variable
 * @returns {string} Base uploads URL
 */
export const getUploadsBaseUrl = () => {
  return process.env.UPLOADS_BASE_URL || 'http://localhost:5000/uploads';
};

/**
 * Construct a full API URL from a path
 * @param {string} path - API endpoint path (e.g., '/api/auth/login' or 'api/auth/login')
 * @returns {string} Full API URL
 */
export const getApiUrl = (path) => {
  const baseUrl = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  // Ensure /api prefix if not present
  if (!cleanPath.startsWith('/api')) {
    return `${baseUrl}/api${cleanPath}`;
  }
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

