import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import PrintDTRModal from './PrintDTRModal';
import { useAuth } from '../authContext';
import { usePermissions } from '../hooks/usePermissions';

const MediaStorage = () => {
  const { user } = useAuth();
  const { canAccessPage, isRootAdmin: permissionsRootAdmin } = usePermissions();

  const sysUserId = Number(user?.USERID ?? user?.id);
  const isRootAdmin = permissionsRootAdmin || sysUserId === 1;
  const canViewDtrRawTab = isRootAdmin || canAccessPage('print-dtr-raw');

  const [config, setConfig] = useState({
    base_path: '',
    photopath: '',
    signaturepath: '',
    thumbpath: '',
    educationpath: '',
    cscpath: '',
    workcertpath: '',
    certificatepath: '',
    leavepath: ''
  });
  
  const [validation, setValidation] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [activeTab, setActiveTab] = useState(isRootAdmin ? 'dtr' : 'media');

  const mediaTypes = [
    { key: 'photopath', label: 'Photo Storage', description: 'Employee photos' },
    { key: 'signaturepath', label: 'Signature Storage', description: 'Employee signatures' },
    { key: 'thumbpath', label: 'Thumbmark Storage', description: 'Employee thumbmarks' },
    { key: 'educationpath', label: 'Education Documents', description: 'Educational certificates' },
    { key: 'cscpath', label: 'CSC Documents', description: 'Civil Service certificates' },
    { key: 'workcertpath', label: 'Work Certificates', description: 'Work experience certificates' },
    { key: 'certificatepath', label: 'General Certificates', description: 'Other certificates' },
    { key: 'leavepath', label: 'Leave Documents', description: 'Leave-related documents' }
  ];

  useEffect(() => {
    console.log('MediaStorage component mounted, fetching config...');
    fetchConfig();
  }, []);

  useEffect(() => {
    if (!canViewDtrRawTab && activeTab === 'dtr') {
      setActiveTab('media');
    }
  }, [canViewDtrRawTab, activeTab]);

  useEffect(() => {
    console.log('Config state updated:', config);
  }, [config]);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const response = await api.get('/media-storage');
      if (response.data.success) {
        setConfig(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching config:', error);
      setMessage({ type: 'error', text: 'Failed to load configuration' });
    } finally {
      setLoading(false);
    }
  };

  const handleBrowseClick = (mediaType) => {
    // Create a file input for folder selection
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.directory = true;
    input.multiple = true;
    
    input.onchange = (e) => {
      if (e.target.files.length > 0) {
        const firstFile = e.target.files[0];
        console.log('Selected file:', firstFile);
        console.log('webkitRelativePath:', firstFile.webkitRelativePath);
        
        // Try to get the full path in different ways
        let folderPath = '';
        
        // Method 1: Try to get full path (works in some browsers)
        if (firstFile.path) {
          // For Electron or Node.js environments
          folderPath = firstFile.path.substring(0, firstFile.path.lastIndexOf('\\') || firstFile.path.lastIndexOf('/'));
        } else if (firstFile.webkitRelativePath) {
          // Method 2: Extract from webkitRelativePath
          const pathParts = firstFile.webkitRelativePath.split('/');
          if (pathParts.length > 1) {
            // Get the directory path (remove filename)
            folderPath = pathParts.slice(0, -1).join('/');
          }
        }
        
        // Method 3: If we still don't have a path, try to construct it
        if (!folderPath && firstFile.webkitRelativePath) {
          // This is a relative path, we need to make it absolute
          // For now, we'll use the relative path and let the user modify if needed
          const pathParts = firstFile.webkitRelativePath.split('/');
          if (pathParts.length > 1) {
            folderPath = pathParts.slice(0, -1).join('/');
          }
        }
        
        console.log('Extracted folder path:', folderPath);
        
        if (folderPath) {
          updatePath(mediaType, folderPath);
        } else {
          console.warn('Could not extract folder path from selected files');
          // Fallback: show a message to the user
          setMessage({ 
            type: 'warning', 
            text: 'Could not extract folder path. Please enter the path manually in the text field.' 
          });
        }
      }
    };
    
    input.click();
  };

  const updatePath = (mediaType, path) => {
    console.log(`Updating ${mediaType} to:`, path);
    setConfig(prev => {
      const newConfig = {
        ...prev,
        [mediaType]: path
      };
      console.log('New config:', newConfig);
      return newConfig;
    });
    
    // Clear validation for this path
    setValidation(prev => ({
      ...prev,
      [mediaType]: null
    }));
  };

  const validatePath = async (path, type) => {
    if (!path) {
      console.log('No path provided for validation');
      return;
    }
    
    console.log(`Validating path: "${path}" for type: ${type}`);
    console.log(`Base path: "${config.base_path}"`);
    
    try {
      const response = await api.post('/media-storage/validate', { 
        path, 
        type, 
        basePath: config.base_path 
      });
      console.log('Validation response:', response.data);
      
      if (response.data.success) {
        setValidation(prev => ({
          ...prev,
          [type]: response.data.valid
        }));
        
        // Show validation message
        if (response.data.valid) {
          setMessage({ type: 'success', text: response.data.message });
        } else {
          setMessage({ type: 'error', text: response.data.message });
        }
        
        return response.data.valid;
      }
    } catch (error) {
      console.error('Error validating path:', error);
      setValidation(prev => ({
        ...prev,
        [type]: false
      }));
      setMessage({ type: 'error', text: `Validation error: ${error.message}` });
      return false;
    }
  };

  const validateAllPaths = async () => {
    setLoading(true);
    const validationResults = {};
    
    for (const mediaType of mediaTypes) {
      if (config[mediaType.key]) {
        const isValid = await validatePath(config[mediaType.key], mediaType.key);
        validationResults[mediaType.key] = isValid;
      }
    }
    
    setValidation(validationResults);
    setLoading(false);
    
    const allValid = Object.values(validationResults).every(valid => valid !== false);
    setMessage({ 
      type: allValid ? 'success' : 'warning', 
      text: allValid ? 'All paths are valid' : 'Some paths have issues' 
    });
  };

  const saveConfig = async () => {
    try {
      setLoading(true);
      // This will either create the first record or update the existing single record
      const response = await api.put('/media-storage', config);
      if (response.data.success) {
        setMessage({ type: 'success', text: 'Configuration saved successfully' });
      }
    } catch (error) {
      console.error('Error saving config:', error);
      setMessage({ type: 'error', text: 'Failed to save configuration' });
    } finally {
      setLoading(false);
    }
  };

  const resetToDefault = () => {
    setConfig({
      base_path: '',
      photopath: '',
      signaturepath: '',
      thumbpath: '',
      educationpath: '',
      cscpath: '',
      workcertpath: '',
      certificatepath: '',
      leavepath: ''
    });
    setValidation({});
    setMessage({ type: 'info', text: 'Configuration reset to default' });
  };

  const getValidationIcon = (mediaType) => {
    const isValid = validation[mediaType];
    if (isValid === true) {
      return <span className="text-green-500">✓</span>;
    } else if (isValid === false) {
      return <span className="text-red-500">✗</span>;
    }
    return null;
  };

  const renderMediaTab = () => (
    <div className="p-6">
      {message.text && (
        <div className={`mb-6 p-4 rounded-md ${
          message.type === 'success' ? 'bg-green-50 text-green-800' :
          message.type === 'error' ? 'bg-red-50 text-red-800' :
          message.type === 'warning' ? 'bg-yellow-50 text-yellow-800' :
          'bg-blue-50 text-blue-800'
        }`}>
          {message.text}
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Base Storage Path</h2>
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={config.base_path}
              onChange={(e) => updatePath('base_path', e.target.value)}
              placeholder="Enter base storage path (e.g., C:\HRIS\backend\uploads)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => handleBrowseClick('base_path')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            📁 Select Folder
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          This will be used as the default base path for all media types if individual paths are not specified.
        </p>
      </div>

      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-900">Individual Media Type Paths</h2>
        {mediaTypes.map((mediaType) => (
          <div key={mediaType.key} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-medium text-gray-900">{mediaType.label}</h3>
                <p className="text-sm text-gray-500">{mediaType.description}</p>
              </div>
              <div className="flex items-center gap-2">
                {getValidationIcon(mediaType.key)}
                <button
                  onClick={() => validatePath(config[mediaType.key], mediaType.key)}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Validate
                </button>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  value={config[mediaType.key]}
                  onChange={(e) => updatePath(mediaType.key, e.target.value)}
                  placeholder={`Enter path for ${mediaType.label.toLowerCase()}`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                onClick={() => handleBrowseClick(mediaType.key)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                📁 Select Folder
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 mt-8 pt-6 border-t border-gray-200">
        <button
          onClick={validateAllPaths}
          disabled={loading}
          className="px-6 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:opacity-50"
        >
          {loading ? 'Validating...' : 'Validate All Paths'}
        </button>
        
        <button
          onClick={saveConfig}
          disabled={loading}
          className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Configuration'}
        </button>
        
        <button
          onClick={resetToDefault}
          disabled={loading}
          className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
        >
          Reset to Default
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-lg bg-white shadow-lg">
          <div className="border-b border-gray-200 px-6 py-4">
            <h1 className="text-2xl font-bold text-gray-900">Media Storage & DTR RAW</h1>
            <p className="mt-1 text-gray-600">
              Configure media paths or manage raw DTR records captured from biometric devices.
            </p>
          </div>

          <div className="border-b border-gray-200 px-6 pt-4">
            <div className="flex gap-2">
              <button
                type="button"
                className={`rounded-t-md px-4 py-2 text-sm font-semibold ${
                  activeTab === 'media'
                    ? 'bg-white text-blue-600 border border-b-white border-gray-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-transparent'
                }`}
                onClick={() => setActiveTab('media')}
              >
                Media Storage
              </button>
              {canViewDtrRawTab && (
                <button
                  type="button"
                  className={`rounded-t-md px-4 py-2 text-sm font-semibold ${
                    activeTab === 'dtr'
                      ? 'bg-white text-blue-600 border border-b-white border-gray-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-transparent'
                  }`}
                  onClick={() => setActiveTab('dtr')}
                >
                  DTR RAW Storage
                </button>
              )}
            </div>
          </div>

          <div className="px-6 pb-6">
            {activeTab === 'media' || !canViewDtrRawTab ? (
              renderMediaTab()
            ) : (
              <div className="pt-6">
                <PrintDTRModal embedded />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MediaStorage;
