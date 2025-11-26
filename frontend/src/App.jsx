import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './authContext';
import Login from './components/Login';
import LoginBio from './components/LoginBio';
import DtrChecker from './components/DTR/DtrChecker';
import HRISManagement from './components/HRISManagement';
import PdsPrintView from './components/201/PdsPrintView';
import './index.css';

// Protected Route component
const ProtectedRoute = ({ children, requireAdmin = false }) => {
  const token = localStorage.getItem('authToken');
  const user = localStorage.getItem('authUser');
  const authMethod = localStorage.getItem('authMethod');
  
  if (!token || !user) {
    // No token or user data - redirect based on auth method
    if (authMethod === 'biometric') {
      return <Navigate to="/login-bio" replace />;
    }
    return <Navigate to="/" replace />;
  }
  
  try {
    const parsedUser = JSON.parse(user);
    
    if (requireAdmin) {
      // Check if user has admin privileges using MySQL sysusers authentication
      // Admin users can be identified by:
      // 1. usertype property exists (indicates sysusers table admin from MySQL)
      // 2. authMethod === 'admin' (indicates admin login mode)
      const hasUsertype = typeof parsedUser.usertype !== 'undefined' && parsedUser.usertype !== null;
      const isAdminAuth = authMethod === 'admin';
      
      if (hasUsertype || isAdminAuth) {
        return children;
      } else {
        // User doesn't have admin privileges - redirect to login
        console.warn('Admin access denied:', { 
          usertype: parsedUser.usertype, 
          authMethod 
        });
        return <Navigate to="/" replace />;
      }
    }
    
    return children;
  } catch (error) {
    console.error('Error parsing user data:', error);
    // Invalid user data - redirect based on auth method
    if (authMethod === 'biometric') {
      return <Navigate to="/login-bio" replace />;
    }
    return <Navigate to="/" replace />;
  }
};

// Component for routes that need the flex layout (all routes except login)
const AppLayout = ({ children }) => (
  <div className="flex min-h-screen h-screen bg-gray-100 overflow-hidden">
    {children}
  </div>
);

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes - Login pages (no layout wrapper) */}
        <Route path="/" element={<Login />} />
        <Route path="/login-bio" element={<LoginBio />} />
        
        {/* Main HRIS Management - has its own layout */}
        <Route path="/hris-management" element={
          <ProtectedRoute requireAdmin={true}>
            <HRISManagement />
          </ProtectedRoute>
        } />
        
        {/* Legacy DTR Management route - redirect to new HRIS Management */}
        <Route path="/dtr-management" element={<Navigate to="/hris-management" replace />} />
        
        {/* DTR Checker (Employee Portal) - has its own layout with MyShiftView and RawLogsView_Dtr as embedded views */}
        <Route path="/dtr-checker" element={
          <ProtectedRoute>
            <DtrChecker />
          </ProtectedRoute>
        } />
        
        {/* PDS Print View */}
        <Route path="/201-employees/print/:employeeId" element={
          <ProtectedRoute>
            <PdsPrintView />
          </ProtectedRoute>
        } />
        
        {/* Catch all route - redirect to login */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;