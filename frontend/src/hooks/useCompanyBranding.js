import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { setFavicon, setPageTitle } from '../utils/faviconUtils';

export const useCompanyBranding = () => {
  const [companyData, setCompanyData] = useState({
    lguDtrName: 'DTR System',
    logoPreview: null
  });
  const [loading, setLoading] = useState(true);
  const hasRun = useRef(false); // Prevent double execution

  useEffect(() => {
    // Prevent double execution in Strict Mode
    if (hasRun.current) return;
    hasRun.current = true;

    const fetchCompanyBranding = async () => {
      try {
        const response = await api.get('/company/info');
        if (response.data.success) {
          const data = response.data.data;
          setCompanyData({
            lguDtrName: data.lguDtrName || 'DTR System',
            logoPreview: data.logoPreview || null
          });
          
          // Set favicon and page title
          setFavicon(data.logoPreview);
          setPageTitle(data.lguDtrName);
        }
      } catch (error) {
        console.error('Error fetching company branding:', error);
        // Set default favicon and title
        setFavicon(null);
        setPageTitle('DTR System');
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyBranding();
  }, []);

  return { companyData, loading };
};
