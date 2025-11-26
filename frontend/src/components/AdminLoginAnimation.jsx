import React, { useEffect, useState } from 'react';
import './AdminLoginAnimation.css';
import api from '../utils/api';

const AdminLoginAnimation = ({ onAnimationComplete }) => {
  const [companyData, setCompanyData] = useState({
    lguDtrName: 'DTR Management System',
    logoPreview: null
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompanyInfo = async () => {
      try {
        console.log('🔍 Fetching company info for animation...');
        const response = await api.get('/company/info');
        console.log('📥 Company info response:', response.data);
        
        if (response.data.success) {
          const data = response.data.data;
          console.log('📊 Company data:', data);
          console.log('🖼️ Logo preview:', data.logoPreview);
          
          setCompanyData({
            lguDtrName: data.lguDtrName || 'DTR Management System',
            logoPreview: data.logoPreview // Only use database logo
          });
          
          console.log('✅ Company data set:', {
            lguDtrName: data.lguDtrName || 'DTR Management System',
            hasLogo: !!data.logoPreview
          });
        } else {
          console.log('❌ Company info API returned success: false');
          setCompanyData({
            lguDtrName: 'DTR Management System',
            logoPreview: null // No fallback
          });
        }
      } catch (error) {
        console.error('❌ Error fetching company info:', error);
        console.error('Error details:', error.response?.data);
        setCompanyData({
          lguDtrName: 'DTR Management System',
          logoPreview: null // No fallback
        });
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyInfo();
  }, []);

  useEffect(() => {
    // Only start the animation timer after we've attempted to load company info
    if (!loading) {
      const timer = setTimeout(() => {
        onAnimationComplete();
      }, 3000); // 3 seconds delay

      return () => clearTimeout(timer);
    }
  }, [loading, onAnimationComplete]);

  return (
    <div className="admin-login-animation">
      <div className="animation-container">
        {/* Main logo container */}
        <div className="logo-container">
          {companyData.logoPreview ? (
            <img 
              src={companyData.logoPreview} 
              alt={`${companyData.lguDtrName} Logo`} 
              className="logo-image"
            />
          ) : (
            <div className="default-logo">
              <svg 
                className="logo-image" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" 
                />
              </svg>
            </div>
          )}
        </div>

        {/* Loading text */}
        <div className="loading-text">
          Loading {companyData.lguDtrName}...
        </div>
      </div>
    </div>
  );
};

export default AdminLoginAnimation;