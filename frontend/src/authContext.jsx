// frontend/src/AuthContext.jsx
// Make sure this file is named AuthContext.jsx (Capital A, Capital C) on your disk!
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import api from './utils/api'; // Import your configured axios instance

// Create the AuthContext
const authContext = createContext(null);

// AuthProvider component to wrap your application
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // Stores user data (USERID, NAME, PHOTO, etc.)
  const [token, setToken] = useState(null); // Stores the authentication token
  const [loadingAuth, setLoadingAuth] = useState(true); // Indicates if initial authentication status is being checked

  // Function to load token and user from localStorage (if any)
  const loadAuthFromStorage = useCallback(async () => {
    setLoadingAuth(true);
    try {
      const storedToken = localStorage.getItem('authToken');
      const storedUser = localStorage.getItem('authUser');

      if (storedToken && storedUser) {
        const parsedUser = JSON.parse(storedUser);
        // Ensure the stored user object has an 'id' property, mapping from 'USERID' if needed
        if (parsedUser.USERID && !parsedUser.id) {
          parsedUser.id = parsedUser.USERID;
        }
        
        setToken(storedToken);
        setUser(parsedUser);
        
        // Set the authorization header for future requests
        api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
      } else {
        setToken(null);
        setUser(null);
      }
    } catch (error) {
      console.error("Failed to load auth from storage:", error);
      localStorage.clear(); // Clear invalid storage
    } finally {
      setLoadingAuth(false);
    }
  }, []);

  // Effect to perform initial authentication check when the provider mounts
  useEffect(() => {
    loadAuthFromStorage();
    
    // Listen for custom events to reload auth data (for biometric login)
    const handleAuthUpdate = () => {
      console.log('🔄 Auth update event received, reloading auth data...');
      loadAuthFromStorage();
    };
    
    window.addEventListener('authUpdate', handleAuthUpdate);
    
    return () => {
      window.removeEventListener('authUpdate', handleAuthUpdate);
    };
  }, [loadAuthFromStorage]);

  // Function to handle login
  const login = useCallback(async (username, password, loginMode = 'employee') => {
    try {
      const response = await api.post('/auth/login', {
        username,
        password,
        loginMode // Pass loginMode to backend
      });

      const { user: userData, token: authToken } = response.data;

      if (!authToken) {
        throw new Error('No token received from backend. Login failed.');
      }

      // Ensure 'id' property exists
      const processedUserData = { ...userData };
      if (processedUserData.USERID !== undefined && processedUserData.id === undefined) {
        processedUserData.id = processedUserData.USERID;
      }

      setToken(authToken);
      setUser(processedUserData);

      try {
      localStorage.setItem('authToken', authToken);
        localStorage.setItem('authUser', JSON.stringify(processedUserData));
        // Store authMethod based on loginMode
        if (loginMode === 'admin') {
          localStorage.setItem('authMethod', 'admin');
        } else {
          localStorage.setItem('authMethod', 'portal');
        }
      } catch (storageError) {
        console.error('Error storing to localStorage:', storageError);
        if (storageError.name === 'QuotaExceededError') {
          // Try storing without photo if quota exceeded
          const userDataWithoutPhoto = { ...processedUserData };
          delete userDataWithoutPhoto.PHOTO;
          localStorage.setItem('authUser', JSON.stringify(userDataWithoutPhoto));
        }
        throw storageError;
      }

      api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;

      return true;
    } catch (error) {
      console.error('Login failed:', error.response?.data || error.message);
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      setToken(null);
      setUser(null);
      throw error;
    }
  }, []);

  // Function to handle logout
  const logout = useCallback(() => {
    console.log('🔄 Logging out user - clearing all state data...');
    
    // Clear user state
    setUser(null);
    setToken(null);
    
    // Clear conventional authentication data
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    localStorage.removeItem('authMethod');
    
    // Clear biometric authentication data
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('biometricData');
    localStorage.removeItem('fingerprintData');
    
    // Clear any other potential user data
    localStorage.removeItem('userProfile');
    localStorage.removeItem('userSession');
    localStorage.removeItem('loginData');
    
    // Clear biometric scanning states and reset DigitalPersona reader
    try {
      // Reset biometric scanning states
      localStorage.removeItem('biometricScanningState');
      localStorage.removeItem('fingerprintCaptureState');
      localStorage.removeItem('biometricMatchState');
      localStorage.removeItem('lastBiometricUser');
      localStorage.removeItem('biometricSessionData');
      
      // Clear any cached biometric scores or match data
      localStorage.removeItem('biometricScore');
      localStorage.removeItem('biometricConfidence');
      localStorage.removeItem('lastFingerprintData');
      localStorage.removeItem('biometricMatchHistory');
      
      // Reset DigitalPersona reader if available
      if (window.DigitalPersonaHelper) {
        console.log('🔄 Biometric reader will be reset on next login attempt');
      }
    } catch (error) {
      console.warn('⚠️ Error clearing biometric states:', error);
    }
    
    // Remove authorization header
    delete api.defaults.headers.common['Authorization'];
    
    console.log('✅ Logout completed - all authentication data cleared');
  }, []);

  // Function to handle 401 errors
  const handleUnauthorized = useCallback(() => {
    console.log('Handling unauthorized access - logging out user');
    logout();
    // Force redirect to login page
    window.location.href = '/login';
  }, [logout]);

  const contextValue = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    loadingAuth,
    login,
    logout,
    handleUnauthorized,
    loadAuthFromStorage,
  };

  return (
    <authContext.Provider value={contextValue}>
      {children}
    </authContext.Provider>
  );
};

// Custom hook to easily consume the AuthContext
export const useAuth = () => {
  const context = useContext(authContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default authContext;