import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../authContext';
import AdminLoginAnimation from './AdminLoginAnimation';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginMode, setLoginMode] = useState('employee'); // 'employee' or 'admin'
  const [showPassword, setShowPassword] = useState(false);
  const [showAdminAnimation, setShowAdminAnimation] = useState(false);
  const [loginMethod, setLoginMethod] = useState('password'); // 'password' or 'biometric'
  const [fingerprintStatus, setFingerprintStatus] = useState(''); // Status message for fingerprint
  const [isScanning, setIsScanning] = useState(false);
  const [fingerprintReader, setFingerprintReader] = useState(null);
  
  useEffect(() => {
  // Load DigitalPersona Web SDK
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@digitalpersona/devices@1.0.8/dist/index.min.js';
  script.async = true;
  script.onload = () => {
    console.log('✅ DigitalPersona SDK loaded');
    initializeFingerprintReader();
  };
  script.onerror = () => {
    console.error('❌ Failed to load DigitalPersona SDK');
  };
  document.body.appendChild(script);

  return () => {
    document.body.removeChild(script);
  };
}, []);

  const { login, isAuthenticated, loadingAuth, user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Only navigate if authentication is successful and we have a user
    if (!loadingAuth && isAuthenticated && user) {
      // Debug: Show user object after login
      console.log('DEBUG: user object after login:', user);

      if (loginMode === 'admin') {
        if (typeof user.privilege !== 'undefined') {
          console.log('DEBUG: user.privilege:', user.privilege);
          if (user.privilege > 0) {
            // Show admin animation before navigating
            setShowAdminAnimation(true);
            // Navigation will be handled by the animation component
          } else {
            setErrorMessage('Access Denied. Please contact your System Administrator');
            logout();
          }
        } else {
          setErrorMessage('Unable to verify admin privileges. Please contact your System Administrator.');
          logout();
        }
      } else {
        navigate('/dtr-checker');
      }
    }
    // eslint-disable-next-line
  }, [isAuthenticated, loadingAuth, user, navigate, loginMode, logout]);

  const handleAdminAnimationComplete = () => {
    setShowAdminAnimation(false);
    navigate('/hris-management');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoggingIn(true);

    try {
      console.log('=== LOGIN ATTEMPT ===');
      console.log('Login mode:', loginMode);
      console.log('Username:', username);
      console.log('Password length:', password.length);
      
      // Pass loginMode to the login function so backend can handle different auth methods
      const success = await login(username, password, loginMode);
      
      if (!success) {
        // Login failed - show error message but stay in current mode
        if (loginMode === 'admin') {
          setErrorMessage('Invalid badge number or password. Please check your credentials.');
        } else {
          setErrorMessage('Invalid badge number or PIN. Please check your credentials.');
        }
        // Don't navigate or change mode - just stay where we are
        return;
      }
      
      // If login was successful, the useEffect above will handle navigation
    } catch (err) {
      console.error('Login error:', err);
      if (err.response && err.response.status === 404) {
        setErrorMessage('Login service not found. Please contact your administrator.');
      } else if (err.response && err.response.status === 401) {
        if (loginMode === 'admin') {
          setErrorMessage('Invalid badge number or password. Please check your credentials.');
        } else {
          setErrorMessage('Invalid badge number or SSN. Please check your credentials.');
        }
      } else {
        setErrorMessage('An unexpected error occurred. Please try again.');
      }
      // Don't navigate or change mode - just stay where we are
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLoginModeChange = (mode) => {
    setLoginMode(mode);
    setErrorMessage(''); // Clear any previous error messages
    setUsername(''); // Clear username field
    setPassword(''); // Clear password field
  };

  // Show admin animation if active
  if (showAdminAnimation) {
    return <AdminLoginAnimation onAnimationComplete={handleAdminAnimationComplete} />;
  }

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="flex flex-col items-center space-y-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
            <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-blue-400 rounded-full animate-spin" style={{animationDirection: 'reverse', animationDuration: '0.8s'}}></div>
          </div>
          <span className="text-white text-lg font-medium">Loading application...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute top-40 left-1/2 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{animationDelay: '4s'}}></div>
      </div>

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">DTR System</h1>
            <p className="text-white/70 text-sm">Secure Employee Portal</p>
          </div>
          
          {/* Login Mode Toggle */}
          <div className="mb-8">
            <div className="flex bg-white/10 rounded-2xl p-1 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => handleLoginModeChange('employee')}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  loginMode === 'employee'
                    ? 'bg-white text-slate-900 shadow-lg transform scale-105'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                Employee
              </button>
              <button
                type="button"
                onClick={() => handleLoginModeChange('admin')}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  loginMode === 'admin'
                    ? 'bg-white text-slate-900 shadow-lg transform scale-105'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                Admin
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Badge Number Field */}
            <div className="space-y-2">
              <label htmlFor="username" className="block text-sm font-semibold text-white/90">
                Badge Number
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  type="text"
                  id="username"
                  className="w-full pl-12 pr-4 py-4 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-sm transition-all duration-300"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your badge number"
                  required
                  disabled={isLoggingIn}
                />
              </div>
            </div>
            
            {/* Password/SSN Field */}
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-semibold text-white/90">
                {loginMode === 'admin' ? 'Password' : 'SSN'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  className="w-full pl-12 pr-12 py-4 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-sm transition-all duration-300"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={loginMode === 'admin' ? 'Enter your password' : 'Enter your SSN'}
                  required
                  disabled={isLoggingIn}
                />
                {loginMode === 'admin' && (
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/50 hover:text-white transition-colors duration-200"
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-2xl backdrop-blur-sm">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-200">{errorMessage}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-2xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              disabled={isLoggingIn}
            >
              {isLoggingIn ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-3"></div>
                  Authenticating...
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Login to {loginMode === 'admin' ? 'Management' : 'DTR Checker'}
                </div>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-white/60 text-sm">
              {loginMode === 'admin' 
                ? 'Administrative access to DTR Management System'
                : 'Employee access to DTR Checker Portal'
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
