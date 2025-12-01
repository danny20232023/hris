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

  // Network Share Configuration State
  const [networkShare, setNetworkShare] = useState({
    server_ip: '',
    share_name: '',
    share_path: '',
    username: '',
    password: '',
    domain: '',
    is_enabled: false
  });

  // Connection Status
  const [connectionStatus, setConnectionStatus] = useState(null); // null, 'testing', 'success', 'error'
  const [connectionMessage, setConnectionMessage] = useState('');

  // Folder Management State
  const [folders, setFolders] = useState([]);
  const [selectedFolders, setSelectedFolders] = useState({
    photo: null,
    signature: null,
    thumb: null
  });

  // UI State
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [activeTab, setActiveTab] = useState(isRootAdmin ? 'dtr' : 'media');
  const [editingFolder, setEditingFolder] = useState(null);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [newFolder, setNewFolder] = useState({
    foldername: '',
    folderfor: '',
    mediapath: ''
  });

  // Required media types for employees
  const requiredMediaTypes = [
    { key: 'photo', label: 'Photo', description: 'Employee photos', folderName: 'photo' },
    { key: 'signature', label: 'Signature', description: 'Employee signatures', folderName: 'signature' },
    { key: 'thumb', label: 'Thumbmark', description: 'Employee thumbmarks', folderName: 'thumb' }
  ];

  useEffect(() => {
    console.log('MediaStorage component mounted, fetching config...');
    fetchNetworkShareConfig();
    fetchFolders();
  }, []);

  useEffect(() => {
    if (!canViewDtrRawTab && activeTab === 'dtr') {
      setActiveTab('media');
    }
  }, [canViewDtrRawTab, activeTab]);

  // Fetch network share configuration
  const fetchNetworkShareConfig = async () => {
    try {
      setLoading(true);
      const response = await api.get('/media-storage/network-share');
      if (response.data.success && response.data.data) {
        setNetworkShare(response.data.data);
        console.log('Network share config loaded:', response.data.data);
      } else {
        console.log('No network share configuration found');
      }
    } catch (error) {
      console.error('Error fetching network share config:', error);
      setMessage({ type: 'error', text: 'Failed to load network share configuration' });
    } finally {
      setLoading(false);
    }
  };

  // Fetch all folders
  const fetchFolders = async () => {
    try {
      const response = await api.get('/media-storage/folders');
      if (response.data.success) {
        setFolders(response.data.data || []);
        
        // Map folders to selectedFolders by foldername
        const folderMap = {};
        response.data.data.forEach(folder => {
          const folderName = (folder.foldername || '').toLowerCase();
          if (folderName === 'photo' || folderName === 'signature' || folderName === 'thumb' || folderName === 'thumbmark') {
            const key = folderName === 'thumbmark' ? 'thumb' : folderName;
            folderMap[key] = folder.pathid;
          }
        });
        
        setSelectedFolders(folderMap);
        console.log('Folders loaded:', response.data.data);
        console.log('Selected folders:', folderMap);
      }
    } catch (error) {
      console.error('Error fetching folders:', error);
      setMessage({ type: 'error', text: 'Failed to load folders' });
    }
  };

  // Save network share configuration
  const saveNetworkShareConfig = async () => {
    try {
      setLoading(true);
      setMessage({ type: '', text: '' });
      
      if (!networkShare.server_ip || !networkShare.share_name || !networkShare.username || !networkShare.password) {
        setMessage({ type: 'error', text: 'Please fill in all required fields: Server IP, Share Name, Username, and Password' });
      return;
    }
    
      const response = await api.post('/media-storage/network-share', networkShare);
      if (response.data.success) {
        setMessage({ type: 'success', text: 'Network share configuration saved successfully' });
        // Reset connection status after saving
        setConnectionStatus(null);
        setConnectionMessage('');
      }
    } catch (error) {
      console.error('Error saving network share config:', error);
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to save network share configuration' });
    } finally {
      setLoading(false);
    }
  };

  // Test network share connection
  const testConnection = async () => {
    try {
      setConnectionStatus('testing');
      setConnectionMessage('Testing connection...');
      setMessage({ type: '', text: '' });

      const response = await api.post('/media-storage/test-connection');
      
      if (response.data.success) {
        setConnectionStatus('success');
        setConnectionMessage(response.data.message || 'Connection successful!');
        setMessage({ type: 'success', text: 'Network share connection test successful' });
      } else {
        setConnectionStatus('error');
        setConnectionMessage(response.data.message || 'Connection test failed');
        setMessage({ type: 'error', text: response.data.message || 'Connection test failed' });
      }
    } catch (error) {
      setConnectionStatus('error');
      setConnectionMessage(error.response?.data?.message || 'Connection test failed');
      setMessage({ type: 'error', text: error.response?.data?.message || 'Connection test failed' });
    }
  };

  // Add new folder
  const addFolder = async () => {
    try {
      setLoading(true);
      setMessage({ type: '', text: '' });

      if (!newFolder.foldername || !newFolder.folderfor) {
        setMessage({ type: 'error', text: 'Please fill in Folder Name and Folder For fields' });
        return;
        }
        
      const response = await api.post('/media-storage/folders', newFolder);
      if (response.data.success) {
        setMessage({ type: 'success', text: 'Folder added successfully' });
        setNewFolder({ foldername: '', folderfor: '', mediapath: '' });
        setShowFolderForm(false);
        await fetchFolders();
      }
    } catch (error) {
      console.error('Error adding folder:', error);
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to add folder' });
    } finally {
      setLoading(false);
    }
  };

  // Update folder
  const updateFolder = async (pathid, updates) => {
    try {
    setLoading(true);
      setMessage({ type: '', text: '' });

      const response = await api.put(`/media-storage/folders/${pathid}`, updates);
      if (response.data.success) {
        setMessage({ type: 'success', text: 'Folder updated successfully' });
        setEditingFolder(null);
        await fetchFolders();
      }
    } catch (error) {
      console.error('Error updating folder:', error);
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update folder' });
    } finally {
      setLoading(false);
    }
  };

  // Delete folder
  const deleteFolder = async (pathid) => {
    if (!window.confirm('Are you sure you want to delete this folder? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      setMessage({ type: '', text: '' });

      const response = await api.delete(`/media-storage/folders/${pathid}`);
      if (response.data.success) {
        setMessage({ type: 'success', text: 'Folder deleted successfully' });
        await fetchFolders();
      }
    } catch (error) {
      console.error('Error deleting folder:', error);
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to delete folder' });
    } finally {
      setLoading(false);
    }
  };

  // Handle folder selection for required media types
  const handleFolderSelection = (mediaType, pathid) => {
    setSelectedFolders(prev => ({
      ...prev,
      [mediaType]: pathid
    }));
  };

  // Render Network Share Configuration Section
  const renderNetworkShareConfig = () => (
    <div className="mb-8 p-6 border border-gray-200 rounded-lg bg-gray-50">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Network File Share Setup</h2>
      <p className="text-sm text-gray-600 mb-6">
        Configure Windows file sharing credentials to connect to the network storage server.
      </p>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Server IP <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={networkShare.server_ip || ''}
              onChange={(e) => setNetworkShare(prev => ({ ...prev, server_ip: e.target.value }))}
              placeholder="192.168.11.26"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Share Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={networkShare.share_name || ''}
              onChange={(e) => setNetworkShare(prev => ({ ...prev, share_name: e.target.value }))}
              placeholder="hris"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Share Path (optional)
          </label>
          <input
            type="text"
            value={networkShare.share_path || ''}
            onChange={(e) => setNetworkShare(prev => ({ ...prev, share_path: e.target.value }))}
            placeholder="uploads"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">Sub-path within the share (e.g., "uploads")</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Username <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={networkShare.username || ''}
              onChange={(e) => setNetworkShare(prev => ({ ...prev, username: e.target.value }))}
              placeholder="itsmhris"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={networkShare.password === '***HIDDEN***' ? '' : (networkShare.password || '')}
              onChange={(e) => setNetworkShare(prev => ({ ...prev, password: e.target.value }))}
              placeholder={networkShare.password === '***HIDDEN***' ? 'Enter new password or leave blank to keep current' : 'Enter password'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {networkShare.password === '***HIDDEN***' && (
              <p className="text-xs text-gray-500 mt-1">Leave blank to keep current password</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Domain (optional)
          </label>
          <input
            type="text"
            value={networkShare.domain || ''}
            onChange={(e) => setNetworkShare(prev => ({ ...prev, domain: e.target.value }))}
            placeholder="WORKGROUP"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="is_enabled"
            checked={networkShare.is_enabled}
            onChange={(e) => setNetworkShare(prev => ({ ...prev, is_enabled: e.target.checked }))}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="is_enabled" className="ml-2 block text-sm text-gray-700">
            Enable Network File Share
          </label>
        </div>

        <div className="flex gap-4 pt-4">
          <button
            onClick={saveNetworkShareConfig}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Network Share Config'}
          </button>

          <button
            onClick={testConnection}
            disabled={loading || !networkShare.server_ip || !networkShare.share_name}
            className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
          >
            {connectionStatus === 'testing' ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        {connectionStatus && (
          <div className={`mt-4 p-4 rounded-md ${
            connectionStatus === 'success' ? 'bg-green-50 text-green-800' :
            connectionStatus === 'error' ? 'bg-red-50 text-red-800' :
            'bg-blue-50 text-blue-800'
          }`}>
            <p className="font-medium">
              {connectionStatus === 'success' ? '✓ ' : connectionStatus === 'error' ? '✗ ' : '⏳ '}
              {connectionMessage}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  // Render Folder Management Section
  const renderFolderManagement = () => {
    const canManageFolders = connectionStatus === 'success' || folders.length > 0;

    return (
      <div className="p-6 border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Media Folder Configuration</h2>
            <p className="text-sm text-gray-600 mt-1">
              Configure folders for storing employee photos, signatures, and thumbmarks.
            </p>
          </div>
          {canManageFolders && (
            <button
              onClick={() => {
                setNewFolder({ foldername: '', folderfor: '', mediapath: '' });
                setShowFolderForm(true);
                setEditingFolder(null);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              + Add Folder
            </button>
          )}
        </div>

        {!canManageFolders && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-yellow-800">
              Please configure and test the network share connection first before adding folders.
            </p>
          </div>
        )}

        {/* Required Media Types Section */}
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Required Media Types</h3>
          <div className="space-y-4">
            {requiredMediaTypes.map((mediaType) => {
              const assignedFolder = folders.find(f => f.pathid === selectedFolders[mediaType.key]);
              const availableFolders = folders.filter(f => {
                const folderName = (f.foldername || '').toLowerCase();
                return folderName === mediaType.folderName || 
                       (mediaType.key === 'thumb' && folderName === 'thumbmark');
              });

              return (
                <div key={mediaType.key} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-medium text-gray-900">{mediaType.label}</h4>
                      <p className="text-sm text-gray-500">{mediaType.description}</p>
                    </div>
                    {assignedFolder && (
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                        ✓ Configured
                      </span>
                    )}
                  </div>

                  {assignedFolder ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">Folder:</span> {assignedFolder.foldername}
                        </p>
                        <p className="text-sm text-gray-500">
                          <span className="font-medium">Path:</span> {assignedFolder.mediapath}
                        </p>
                      </div>
                      <button
                        onClick={() => handleFolderSelection(mediaType.key, null)}
                        className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Folder
                      </label>
                      <select
                        value={selectedFolders[mediaType.key] || ''}
                        onChange={(e) => handleFolderSelection(mediaType.key, e.target.value ? Number(e.target.value) : null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- Select a folder --</option>
                        {availableFolders.map(folder => (
                          <option key={folder.pathid} value={folder.pathid}>
                            {folder.foldername} - {folder.folderfor}
                          </option>
                        ))}
                      </select>
                      {availableFolders.length === 0 && (
                        <div className="mt-2">
                          <p className="text-sm text-yellow-600 mb-2">
                            No folders found. Please add a folder with name "{mediaType.folderName}" first.
                          </p>
                          <button
                            onClick={() => {
                              setNewFolder({
                                foldername: mediaType.folderName,
                                folderfor: mediaType.description,
                                mediapath: ''
                              });
                              setShowFolderForm(true);
                              setEditingFolder(null);
                            }}
                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            + Create {mediaType.label} Folder
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* All Folders List */}
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">All Folders</h3>
          {folders.length === 0 ? (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-md text-center text-gray-500">
              No folders configured yet. Click "Add Folder" to create one.
            </div>
          ) : (
            <div className="space-y-3">
              {folders.map((folder) => (
                <div key={folder.pathid} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-medium text-gray-900">{folder.foldername}</h4>
                        {selectedFolders.photo === folder.pathid && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">Photo</span>
                        )}
                        {selectedFolders.signature === folder.pathid && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">Signature</span>
                        )}
                        {selectedFolders.thumb === folder.pathid && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">Thumb</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-1">{folder.folderfor}</p>
                      <p className="text-xs text-gray-500 font-mono">{folder.mediapath}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingFolder(folder);
                          setNewFolder({
                            foldername: folder.foldername,
                            folderfor: folder.folderfor,
                            mediapath: folder.mediapath
                          });
                          setShowFolderForm(true);
                        }}
                        className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteFolder(folder.pathid)}
                        disabled={selectedFolders.photo === folder.pathid || 
                                 selectedFolders.signature === folder.pathid || 
                                 selectedFolders.thumb === folder.pathid}
                        className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={selectedFolders.photo === folder.pathid || 
                               selectedFolders.signature === folder.pathid || 
                               selectedFolders.thumb === folder.pathid
                               ? 'Cannot delete folder that is in use' : 'Delete folder'}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add/Edit Folder Form Modal */}
        {showFolderForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {editingFolder ? 'Edit Folder' : 'Add New Folder'}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Folder Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newFolder.foldername}
                    onChange={(e) => setNewFolder(prev => ({ ...prev, foldername: e.target.value }))}
                    placeholder="photo, signature, thumb"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Use: photo, signature, thumb, thumbmark</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Folder For <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newFolder.folderfor}
                    onChange={(e) => setNewFolder(prev => ({ ...prev, folderfor: e.target.value }))}
                    placeholder="Employee Photos, Employee Signatures, etc."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Description of what this folder is used for</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Media Path (auto-generated, editable)
                  </label>
                  <input
                    type="text"
                    value={newFolder.mediapath}
                    onChange={(e) => setNewFolder(prev => ({ ...prev, mediapath: e.target.value }))}
                    placeholder="Will be auto-generated from network share"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Full path to the folder (auto-generated if left empty)</p>
                </div>
              </div>

              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => {
                    setShowFolderForm(false);
                    setEditingFolder(null);
                    setNewFolder({ foldername: '', folderfor: '', mediapath: '' });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (editingFolder) {
                      updateFolder(editingFolder.pathid, newFolder);
                    } else {
                      addFolder();
                    }
                  }}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : editingFolder ? 'Update' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render Media Tab
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

      {renderNetworkShareConfig()}
      {renderFolderManagement()}
    </div>
  );

  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-lg bg-white shadow-lg">
          <div className="border-b border-gray-200 px-6 py-4">
            <h1 className="text-2xl font-bold text-gray-900">Media Storage & DTR RAW</h1>
            <p className="mt-1 text-gray-600">
              Configure network file sharing and media folders for employee photos, signatures, and thumbmarks.
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
