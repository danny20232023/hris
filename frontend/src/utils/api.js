// frontend/src/utils/api.js
import axios from 'axios';

// Create axios instance with base configuration
// Use environment variable for API URL, with fallback for development
const getApiBaseUrl = () => {
  // In development mode, always use relative path to leverage Vite proxy
  // This ensures API calls go through the proxy regardless of access method
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    // Use relative path to leverage Vite proxy
    // When accessed via http://192.168.8.18:5173, this becomes /api which proxies to backend
    return '/api';
  }
  // In production/Docker, use VITE_API_URL from environment
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // Fallback for production without env var
  return '/api';
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15000, // 15 seconds - increased for biometric operations (8s countdown + processing)
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      // Log warning if token is missing for protected routes
      if (config.url && !config.url.includes('/company/info') && !config.url.includes('/auth/login')) {
        console.warn('API request without token:', config.url);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 errors (unauthorized/token expired)
    if (error.response && error.response.status === 401) {
      console.log('Token expired or unauthorized - redirecting to login');
      
      // Clear stored authentication data
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      
      // Remove authorization header
      delete api.defaults.headers.common['Authorization'];
      
      // Only redirect if not on login page, not on biometric login page, and not calling company/info
      const currentPath = window.location.pathname;
      const isCompanyInfoCall = error.config?.url?.includes('/company/info');
      const isBiometricLoginCall = error.config?.url?.includes('/auth/biometric-login');
      const isLoginBioPage = currentPath.includes('/login-bio');
      
      if (currentPath !== '/' && !isCompanyInfoCall && !isBiometricLoginCall && !isLoginBioPage) {
        // Force redirect to login page
        window.location.href = '/';
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;