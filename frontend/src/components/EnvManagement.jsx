import React, { useState, useEffect } from 'react';
import { useAuth } from '../authContext';
import api from '../utils/api';

const EnvManagement = () => {
  const { user } = useAuth();
  const [envVariables, setEnvVariables] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [filePath, setFilePath] = useState('');
  const [deploymentInfo, setDeploymentInfo] = useState(null);

  useEffect(() => {
    fetchEnvVariables();
    detectDeploymentEnvironment();
  }, []);

  const detectDeploymentEnvironment = async () => {
    try {
      const response = await api.get('/env/deployment-info');
      setDeploymentInfo(response.data);
    } catch (error) {
      console.log('Deployment info not available, using fallback methods');
      setDeploymentInfo({
        environment: 'development',
        processManager: 'none',
        hasPM2: false,
        hasNodemon: false,
        hasDocker: false
      });
    }
  };

  const fetchEnvVariables = async () => {
    setLoading(true);
    try {
      const response = await api.get('/env');
      setEnvVariables(response.data.data || {});
      setFilePath(response.data.filePath || '');
    } catch (error) {
      console.error('Error fetching environment variables:', error);
      setError('Failed to fetch environment variables');
    } finally {
      setLoading(false);
    }
  };

  const handleVariableChange = (key, value) => {
    setEnvVariables(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        value: value
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    
    try {
      await api.put('/env', { variables: envVariables });
      setMessage('Environment variables updated successfully!');
      
      // Automatically restart services
      setTimeout(() => {
        handleAutoRestart();
      }, 1000);
    } catch (error) {
      console.error('Error updating environment variables:', error);
      setError('Failed to update environment variables');
    } finally {
      setSaving(false);
    }
  };

  const handleAutoRestart = async () => {
    setRestarting(true);
    setMessage('Restarting services to apply changes...');
    
    try {
      // Step 1: Restart backend server
      setMessage('Step 1/3: Restarting backend server...');
      await api.post('/env/restart');
      
      // Step 2: Wait for backend to restart
      setMessage('Step 2/3: Waiting for backend to restart...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Step 3: Refresh frontend
      setMessage('Step 3/3: Refreshing frontend...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Reload the page to refresh frontend
      window.location.reload();
      
    } catch (error) {
      console.error('Error during restart process:', error);
      setError('Error during restart process. Please manually refresh the page.');
      setMessage('Backend restart initiated. Please refresh the page manually in a few seconds.');
      
      // Still reload the page even if there's an error
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } finally {
      setRestarting(false);
    }
  };

  const handleManualRestart = async () => {
    if (window.confirm('This will restart the backend server and refresh the frontend. Continue?')) {
      await handleAutoRestart();
    }
  };

  const addNewVariable = () => {
    const key = prompt('Enter variable name:');
    if (key && !envVariables[key]) {
      setEnvVariables(prev => ({
        ...prev,
        [key]: {
          value: '',
          lineNumber: Object.keys(prev).length + 1,
          originalLine: `${key}=`
        }
      }));
    }
  };

  const removeVariable = (key) => {
    if (window.confirm(`Are you sure you want to remove ${key}?`)) {
      setEnvVariables(prev => {
        const newVars = { ...prev };
        delete newVars[key];
        return newVars;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Loading environment variables...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Environment Variables Management</h1>
        <p className="text-gray-600">Manage system configuration variables</p>
        {filePath && (
          <p className="text-sm text-gray-500 mt-1">File: {filePath}</p>
        )}
        {deploymentInfo && (
          <div className="mt-2 p-2 bg-blue-50 rounded text-sm">
            <strong>Environment:</strong> {deploymentInfo.environment} | 
            <strong> Process Manager:</strong> {deploymentInfo.processManager} |
            <strong> PM2:</strong> {deploymentInfo.hasPM2 ? 'Yes' : 'No'} |
            <strong> Nodemon:</strong> {deploymentInfo.hasNodemon ? 'Yes' : 'No'}
          </div>
        )}
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

      {/* Actions */}
      <div className="mb-6 flex gap-4">
        <button
          onClick={addNewVariable}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          disabled={saving || restarting}
        >
          Add New Variable
        </button>
        <button
          onClick={handleSave}
          disabled={saving || restarting}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : restarting ? 'Restarting...' : 'Save & Restart Services'}
        </button>
        <button
          onClick={handleManualRestart}
          disabled={saving || restarting}
          className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
        >
          Manual Restart
        </button>
        <button
          onClick={fetchEnvVariables}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          disabled={saving || restarting}
        >
          Refresh
        </button>
      </div>

      {/* Variables Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Variable Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Value
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Object.keys(envVariables).length === 0 ? (
              <tr>
                <td colSpan="3" className="px-6 py-4 text-center text-gray-500">
                  No environment variables found
                </td>
              </tr>
            ) : (
              Object.entries(envVariables).map(([key, variable]) => (
                <tr key={key}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{key}</div>
                    <div className="text-sm text-gray-500">Line {variable.lineNumber}</div>
                  </td>
                  <td className="px-6 py-4">
                    <input
                      type={key.toLowerCase().includes('password') ? 'password' : 'text'}
                      value={variable.value}
                      onChange={(e) => handleVariableChange(key, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter value..."
                      disabled={saving || restarting}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => removeVariable(key)}
                      className="text-red-600 hover:text-red-900 text-sm"
                      disabled={saving || restarting}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Warning */}
      <div className="mt-6 p-4 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
        <h3 className="font-semibold mb-2">⚠️ Important Notes:</h3>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Changes to environment variables will automatically restart both backend and frontend services</li>
          <li>Be careful when modifying database connection settings</li>
          <li>Always backup your .env file before making changes</li>
          <li>Some variables may be sensitive (passwords, API keys)</li>
          <li>The page will automatically refresh after services restart</li>
        </ul>
      </div>

      {/* Restart Progress */}
      {restarting && (
        <div className="mt-6 p-4 bg-blue-100 border border-blue-400 text-blue-700 rounded">
          <h3 className="font-semibold mb-2">🔄 Restarting Services...</h3>
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700 mr-2"></div>
            <span className="text-sm">Please wait while services restart...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnvManagement;