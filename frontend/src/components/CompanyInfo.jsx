import React, { useState, useEffect } from 'react';
import { useAuth } from '../authContext';
import api from '../utils/api';

const CompanyInfo = () => {
  const { user } = useAuth();
  const [companyData, setCompanyData] = useState({
    lguDtrName: 'DTR Management System',
    lguName: '',
    lguType: 'Municipal',
    lguAddress: '',
    lguContact: '',
    lguEmail: '',
    lguFbUrl: '',
    lguMayor: '',
    lguHrmo: '',
    lguTreasurer: '',
    lguBursar: ''
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // File upload states
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [mayorEsigFile, setMayorEsigFile] = useState(null);
  const [mayorEsigPreview, setMayorEsigPreview] = useState('');
  const [hrmoEsigFile, setHrmoEsigFile] = useState(null);
  const [hrmoEsigPreview, setHrmoEsigPreview] = useState('');
  const [treasurerEsigFile, setTreasurerEsigFile] = useState(null);
  const [treasurerEsigPreview, setTreasurerEsigPreview] = useState('');
  const [bursarEsigFile, setBursarEsigFile] = useState(null);
  const [bursarEsigPreview, setBursarEsigPreview] = useState('');

  const lguTypes = [
    { value: 'Municipal', label: 'Municipal' },
    { value: 'Province', label: 'Province' },
    { value: 'National', label: 'National' }
  ];

  useEffect(() => {
    fetchCompanyInfo();
  }, []);

  const fetchCompanyInfo = async () => {
    setLoading(true);
    try {
      const response = await api.get('/company/info');
      if (response.data.success) {
        setCompanyData(response.data.data);
        // Set preview URLs if images exist
        if (response.data.data.logoPreview) setLogoPreview(response.data.data.logoPreview);
        if (response.data.data.mayorEsigPreview) setMayorEsigPreview(response.data.data.mayorEsigPreview);
        if (response.data.data.hrmoEsigPreview) setHrmoEsigPreview(response.data.data.hrmoEsigPreview);
        if (response.data.data.treasurerEsigPreview) setTreasurerEsigPreview(response.data.data.treasurerEsigPreview);
        if (response.data.data.bursarEsigPreview) setBursarEsigPreview(response.data.data.bursarEsigPreview);
      }
    } catch (error) {
      console.error('Error fetching company info:', error);
      // Set empty default values if API fails
      setCompanyData({
        lguDtrName: '',
        lguName: '',
        lguType: 'Municipal',
        lguAddress: '',
        lguContact: '',
        lguEmail: '',
        lguFbUrl: '',
        lguMayor: '',
        lguHrmo: '',
        lguTreasurer: '',
        lguBursar: ''
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setCompanyData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // File upload handlers
  const handleFileUpload = (file, type) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please upload a valid image file (JPEG, PNG, GIF, or WebP)');
      return;
    }

    // Validate file size (max 5MB for original files)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    // Clear any previous errors
    setError('');

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = e.target.result;
      
      switch (type) {
        case 'logo':
          setLogoFile(file);
          setLogoPreview(preview);
          setMessage('Logo will be resized to 200x200 pixels and compressed to max 50KB');
          break;
        case 'mayorEsig':
          setMayorEsigFile(file);
          setMayorEsigPreview(preview);
          setMessage('E-signature will be resized to 300x200 pixels and compressed to max 100KB');
          break;
        case 'hrmoEsig':
          setHrmoEsigFile(file);
          setHrmoEsigPreview(preview);
          setMessage('E-signature will be resized to 300x200 pixels and compressed to max 100KB');
          break;
        case 'treasurerEsig':
          setTreasurerEsigFile(file);
          setTreasurerEsigPreview(preview);
          setMessage('E-signature will be resized to 300x200 pixels and compressed to max 100KB');
          break;
        case 'bursarEsig':
          setBursarEsigFile(file);
          setBursarEsigPreview(preview);
          setMessage('E-signature will be resized to 300x200 pixels and compressed to max 100KB');
          break;
        default:
          break;
      }
    };
    reader.readAsDataURL(file);
  };

  const removeFile = (type) => {
    switch (type) {
      case 'logo':
        setLogoFile(null);
        setLogoPreview('');
        break;
      case 'mayorEsig':
        setMayorEsigFile(null);
        setMayorEsigPreview('');
        break;
      case 'hrmoEsig':
        setHrmoEsigFile(null);
        setHrmoEsigPreview('');
        break;
      case 'treasurerEsig':
        setTreasurerEsigFile(null);
        setTreasurerEsigPreview('');
        break;
      case 'bursarEsig':
        setBursarEsigFile(null);
        setBursarEsigPreview('');
        break;
      default:
        break;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    
    try {
      // Prepare form data for file uploads
      const formData = new FormData();
      
      // Add text fields
      Object.keys(companyData).forEach(key => {
        formData.append(key, companyData[key]);
      });

      // Add files if they exist
      if (logoFile) formData.append('logo', logoFile);
      if (mayorEsigFile) formData.append('mayorEsig', mayorEsigFile);
      if (hrmoEsigFile) formData.append('hrmoEsig', hrmoEsigFile);
      if (treasurerEsigFile) formData.append('treasurerEsig', treasurerEsigFile);
      if (bursarEsigFile) formData.append('bursarEsig', bursarEsigFile);

      const response = await api.put('/company/info', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      if (response.data.success) {
        setMessage('Company information updated successfully!');
        // Clear file states after successful save
        setLogoFile(null);
        setMayorEsigFile(null);
        setHrmoEsigFile(null);
        setTreasurerEsigFile(null);
        setBursarEsigFile(null);
      } else {
        setError(response.data.message || 'Failed to update company information');
      }
    } catch (error) {
      console.error('Error updating company info:', error);
      setError(error.response?.data?.message || 'Failed to update company information');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Loading company information...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Company Information</h1>
        <p className="text-gray-600">Manage LGU details and organization information</p>
      </div>

      {/* Messages */}
      {message && (
        <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          {message}
        </div>
      )}
      
      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Organization Details Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Organization Details</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* DTR System Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                DTR System Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={companyData.lguDtrName}
                onChange={(e) => handleInputChange('lguDtrName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter DTR system name..."
                disabled={saving}
                maxLength={25}
              />
              <p className="text-xs text-gray-500 mt-1">This will be displayed as the main title in the application header (max 25 characters)</p>
            </div>

            {/* LGU Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                LGU Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={companyData.lguName}
                onChange={(e) => handleInputChange('lguName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter LGU name..."
                disabled={saving}
                maxLength={50}
              />
            </div>

            {/* LGU Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                LGU Type <span className="text-red-500">*</span>
              </label>
              <select
                value={companyData.lguType}
                onChange={(e) => handleInputChange('lguType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={saving}
              >
                {lguTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={companyData.lguAddress}
                onChange={(e) => handleInputChange('lguAddress', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter complete address..."
                disabled={saving}
                maxLength={50}
              />
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Contact */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contact Number
              </label>
              <input
                type="text"
                value={companyData.lguContact}
                onChange={(e) => handleInputChange('lguContact', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter contact number..."
                disabled={saving}
                maxLength={20}
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={companyData.lguEmail}
                onChange={(e) => handleInputChange('lguEmail', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter email address..."
                disabled={saving}
                maxLength={25}
              />
            </div>

            {/* Facebook URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Facebook URL
              </label>
              <input
                type="url"
                value={companyData.lguFbUrl}
                onChange={(e) => handleInputChange('lguFbUrl', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter Facebook page URL..."
                disabled={saving}
                maxLength={250}
              />
            </div>
          </div>
        </div>
      </div>

      {/* LGU Signatories Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">LGU Signatories</h2>
        
        <div className="space-y-6">
          {/* Mayor */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mayor Name
              </label>
              <input
                type="text"
                value={companyData.lguMayor}
                onChange={(e) => handleInputChange('lguMayor', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter mayor's name..."
                disabled={saving}
                maxLength={50}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mayor's E-Signature
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                {mayorEsigPreview ? (
                  <div className="text-center">
                    <img
                      src={mayorEsigPreview}
                      alt="Mayor E-Signature Preview"
                      className="max-h-20 max-w-full object-contain mx-auto mb-2"
                    />
                    <div className="flex gap-2 justify-center">
                      <label className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 cursor-pointer">
                        Change
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileUpload(e.target.files[0], 'mayorEsig')}
                          className="hidden"
                          disabled={saving}
                        />
                      </label>
                      <button
                        onClick={() => removeFile('mayorEsig')}
                        className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                        disabled={saving}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <svg className="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <label className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 cursor-pointer">
                      Upload E-Signature
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e.target.files[0], 'mayorEsig')}
                        className="hidden"
                        disabled={saving}
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* HRMO */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                HRMO Name
              </label>
              <input
                type="text"
                value={companyData.lguHrmo}
                onChange={(e) => handleInputChange('lguHrmo', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter HRMO name..."
                disabled={saving}
                maxLength={50}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                HRMO's E-Signature
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                {hrmoEsigPreview ? (
                  <div className="text-center">
                    <img
                      src={hrmoEsigPreview}
                      alt="HRMO E-Signature Preview"
                      className="max-h-20 max-w-full object-contain mx-auto mb-2"
                    />
                    <div className="flex gap-2 justify-center">
                      <label className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 cursor-pointer">
                        Change
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileUpload(e.target.files[0], 'hrmoEsig')}
                          className="hidden"
                          disabled={saving}
                        />
                      </label>
                      <button
                        onClick={() => removeFile('hrmoEsig')}
                        className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                        disabled={saving}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <svg className="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <label className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 cursor-pointer">
                      Upload E-Signature
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e.target.files[0], 'hrmoEsig')}
                        className="hidden"
                        disabled={saving}
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Treasurer */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Treasurer Name
              </label>
              <input
                type="text"
                value={companyData.lguTreasurer}
                onChange={(e) => handleInputChange('lguTreasurer', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter treasurer's name..."
                disabled={saving}
                maxLength={50}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Treasurer's E-Signature
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                {treasurerEsigPreview ? (
                  <div className="text-center">
                    <img
                      src={treasurerEsigPreview}
                      alt="Treasurer E-Signature Preview"
                      className="max-h-20 max-w-full object-contain mx-auto mb-2"
                    />
                    <div className="flex gap-2 justify-center">
                      <label className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 cursor-pointer">
                        Change
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileUpload(e.target.files[0], 'treasurerEsig')}
                          className="hidden"
                          disabled={saving}
                        />
                      </label>
                      <button
                        onClick={() => removeFile('treasurerEsig')}
                        className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                        disabled={saving}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <svg className="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <label className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 cursor-pointer">
                      Upload E-Signature
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e.target.files[0], 'treasurerEsig')}
                        className="hidden"
                        disabled={saving}
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bursar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bursar Name
              </label>
              <input
                type="text"
                value={companyData.lguBursar}
                onChange={(e) => handleInputChange('lguBursar', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter bursar's name..."
                disabled={saving}
                maxLength={50}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bursar's E-Signature
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                {bursarEsigPreview ? (
                  <div className="text-center">
                    <img
                      src={bursarEsigPreview}
                      alt="Bursar E-Signature Preview"
                      className="max-h-20 max-w-full object-contain mx-auto mb-2"
                    />
                    <div className="flex gap-2 justify-center">
                      <label className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 cursor-pointer">
                        Change
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileUpload(e.target.files[0], 'bursarEsig')}
                          className="hidden"
                          disabled={saving}
                        />
                      </label>
                      <button
                        onClick={() => removeFile('bursarEsig')}
                        className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                        disabled={saving}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <svg className="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <label className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 cursor-pointer">
                      Upload E-Signature
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e.target.files[0], 'bursarEsig')}
                        className="hidden"
                        disabled={saving}
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Logo Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">LGU Logo</h2>
        
        <div className="max-w-md mx-auto">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
            {logoPreview ? (
              <div className="text-center">
                <img
                  src={logoPreview}
                  alt="Logo Preview"
                  className="max-h-40 max-w-full object-contain mx-auto mb-4"
                />
                <div className="flex gap-2 justify-center">
                  <label className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer text-sm">
                    Change Logo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e.target.files[0], 'logo')}
                      className="hidden"
                      disabled={saving}
                    />
                  </label>
                  <button
                    onClick={() => removeFile('logo')}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
                    disabled={saving}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <svg className="w-20 h-20 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <label className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer text-sm">
                  Upload Logo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e.target.files[0], 'logo')}
                    className="hidden"
                    disabled={saving}
                  />
                </label>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2 text-center">Recommended size: 200x200 pixels, max 2MB</p>
        </div>
      </div>

      {/* Action Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default CompanyInfo;