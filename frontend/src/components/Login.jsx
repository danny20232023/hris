import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../authContext';
import AdminLoginAnimation from './AdminLoginAnimation';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdminAnimation, setShowAdminAnimation] = useState(false);

  // Biometric login states
  const [isBiometricMode, setIsBiometricMode] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  // Auto-detect admin access request from DtrChecker
  useEffect(() => {
    // Check for admin access request from DtrChecker
    const adminAccessRequest = sessionStorage.getItem('adminAccessRequest');
    const adminUsername = sessionStorage.getItem('adminAccessUsername');
    
    // Check URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');

    // If admin access requested or mode=admin in URL, switch to admin mode
    if (adminAccessRequest === 'true' || mode === 'admin') {
      console.log('🔍 Admin access request detected, switching to admin mode');
      setIsAdminMode(true);
      
      // Pre-fill username if available
      if (adminUsername) {
        setUsername(adminUsername);
        console.log('✅ Pre-filled admin username:', adminUsername);
      }
      
      // Clear sessionStorage after reading (but keep for manual login if needed)
      // We'll clear them after successful login or if user cancels
    }
  }, []); // Run once on component mount

  // Reset biometric mode
  const resetBiometricMode = () => {
    setIsBiometricMode(false);
  };

  // Handle regular login
  const handleLogin = async (e) => {
    e.preventDefault();
    if (isLoggingIn || isAdminMode) return;

    setIsLoggingIn(true);
    setErrorMessage('');

    try {
      const trimmedUsername = username.trim();
      const normalizedPin = password.replace(/\D/g, '');

      if (!trimmedUsername || !normalizedPin) {
        throw new Error('Please enter your portal username and PIN.');
      }

      await login(trimmedUsername, normalizedPin);
      navigate('/dtr-checker');
    } catch (error) {
      if (error?.response?.data?.message) {
        setErrorMessage(error.response.data.message);
      } else if (error?.response?.status === 403) {
        setErrorMessage('Portal Access is Inactive');
      } else if (error?.response?.status === 401) {
        setErrorMessage('Invalid Portal Access');
      } else {
        setErrorMessage(error.message || 'Login failed');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle admin login
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    if (isLoggingIn || !isAdminMode) return;

    setIsLoggingIn(true);
    setErrorMessage('');
    setShowAdminAnimation(false); // Ensure animation is hidden

    try {
      const loginSuccess = await login(username, password, 'admin');

      if (!loginSuccess) {
        setErrorMessage('Invalid credentials. Please check your username and password.');
        return;
      }

      handleAdminAnimation();
      await new Promise(resolve => setTimeout(resolve, 3000));
      navigate('/hris-management');
    } catch (error) {
      console.error('Admin login error:', error);
      if (error?.response?.data?.message) {
        setErrorMessage(error.response.data.message);
      } else if (error?.response?.status === 401) {
        setErrorMessage('Invalid credentials. Please check your username and password.');
      } else if (error?.response?.status === 404) {
        setErrorMessage('Admin user not found. Please check your username.');
      } else {
        setErrorMessage(error?.message || 'Invalid login credentials. Please try again.');
      }
      setShowAdminAnimation(false);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle admin animation
  const handleAdminAnimation = () => {
    setShowAdminAnimation(true);
  };

  const handleAnimationComplete = () => {
    setShowAdminAnimation(false);
  };

  if (showAdminAnimation) {
    return <AdminLoginAnimation onAnimationComplete={handleAnimationComplete} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className={`absolute -top-40 -right-40 w-80 h-80 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse ${
          isAdminMode ? 'bg-purple-500' : 'bg-green-500'
        }`}></div>
        <div className={`absolute -bottom-40 -left-40 w-80 h-80 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse ${
          isAdminMode ? 'bg-blue-500' : 'bg-emerald-500'
        }`} style={{animationDelay: '2s'}}></div>
        <div className={`absolute top-40 left-1/2 w-80 h-80 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse ${
          isAdminMode ? 'bg-indigo-500' : 'bg-teal-500'
        }`} style={{animationDelay: '4s'}}></div>
      </div>

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-md">
        <div className={`backdrop-blur-lg rounded-3xl shadow-2xl border p-8 transition-all duration-500 ${
          isAdminMode ? 'bg-white/10 border-white/20' : 'bg-green-500/10 border-green-500/20'
        }`}>
          {/* Header */}
          <div className="text-center mb-8">
            <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 transition-all duration-500 ${
              isAdminMode
                ? 'bg-gradient-to-r from-blue-500 to-purple-600'
                : 'bg-gradient-to-r from-green-500 to-emerald-600'
            }`}>
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Human Resource Information System</h1>
            <p className="text-white/70 text-sm">
              {isAdminMode ? 'Administrator Access' : 'Portal User Access'}
            </p>
          </div>

          {/* Login Form */}
          {!isBiometricMode ? (
            <form onSubmit={isAdminMode ? handleAdminLogin : handleLogin} className="space-y-6">
              {/* Username Input */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-white/90 mb-2">
                  {isAdminMode ? 'Admin Username' : 'Portal Username'}
                </label>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`w-full px-4 py-3 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-300 ${
                    isAdminMode ? 'focus:ring-blue-500' : 'focus:ring-green-500'
                  }`}
                  placeholder={isAdminMode ? 'Enter admin username' : 'Enter your portal username'}
                  required
                />
              </div>

              {/* Password/PIN Input */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-white/90 mb-2">
                  {isAdminMode ? 'Password' : 'PIN'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    value={password}
                    onChange={(e) => {
                      const value = e.target.value;
                      setPassword(isAdminMode ? value : value.replace(/\D/g, ''));
                    }}
                    className={`w-full px-4 py-3 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-300 pr-12 ${
                      isAdminMode ? 'focus:ring-blue-500' : 'focus:ring-green-500'
                    }`}
                    placeholder={isAdminMode ? 'Enter your password' : 'Enter your PIN'}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white transition-colors duration-200"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-10.875-6.825a1.5 1.5 0 010-1.5C3.732 7.943 7.522 5 12 5c4.478 0 8.268 2.943 10.875 6.825a1.5 1.5 0 010 1.5z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 11-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Login Button */}
              <button
                type="submit"
                disabled={isLoggingIn}
                className={`w-full py-4 px-6 text-white font-semibold rounded-2xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${
                  isAdminMode
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:ring-blue-500'
                    : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 focus:ring-green-500'
                }`}
              >
                {isLoggingIn ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-3"></div>
                    {isAdminMode ? 'Signing in as Admin...' : 'Signing in...'}
                  </div>
                ) : (
                  isAdminMode ? 'Sign in as Admin' : 'Sign In'
                )}
              </button>

              {/* Biometric Login Button (Employee Mode Only) */}
              {!isAdminMode && (
                <button
                  type="button"
                  onClick={() => navigate('/login-bio')}
                  className="w-full py-3 px-6 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-2xl border border-green-500/20 hover:border-green-400/40 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-transparent"
                >
                  <div className="flex items-center justify-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                    </svg>
                    Use Fingerprint Login
                  </div>
                </button>
              )}
            </form>
          ) : (
            <div className="space-y-6">
              {/* Back to Password Login Button */}
              <button
                type="button"
                onClick={resetBiometricMode}
                className="w-full py-3 px-6 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-2xl border border-white/20 hover:border-white/30 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                <div className="flex items-center justify-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Use Badge Number Instead
                </div>
              </button>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="mt-6 p-4 bg-red-500/20 border border-red-500/30 rounded-2xl backdrop-blur-sm">
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

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-white/60 text-sm">
              Secure access to DHRIS
            </p>
            <button
              type="button"
              onClick={() => {
                setIsAdminMode((prev) => !prev);
                setIsBiometricMode(false);
                setErrorMessage('');
                setShowAdminAnimation(false);
              }}
              className="mt-4 inline-flex items-center justify-center gap-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white/40"
              aria-label={isAdminMode ? 'Switch to employee portal login' : 'Switch to admin login'}
            >
              <span className="text-sm font-medium">
                {isAdminMode ? 'Switch to Employee Portal' : 'Switch to Admin Login'}
              </span>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 7h16M4 12h16M4 17h16"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;

