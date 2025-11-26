import React, { useState, useEffect } from 'react';
import api from '../utils/api';

const DB_Payroll = () => {
  const [config, setConfig] = useState({
    host: '',
    port: '3306',
    database: '',
    username: '',
    password: '',
    enabled: false
  });
  
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // Fetch current configuration
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await api.get('/env/db-payroll');
        if (response.data.success) {
          setConfig(response.data.data);
          setConnectionStatus(response.data.data.connectionStatus);
        }
      } catch (error) {
        console.error('Error fetching Payroll DB config:', error);
      }
    };
    fetchConfig();
  }, []);

  // Test connection
  const handleTestConnection = async () => {
    setTesting(true);
    setMessage({ type: '', text: '' });
    
    try {
      const response = await api.post('/env/db-payroll/test', config);
      
      if (response.data.success) {
        setMessage({ type: 'success', text: '✅ Connection successful!' });
        setConnectionStatus('connected');
      } else {
        setMessage({ type: 'error', text: `❌ ${response.data.message}` });
        setConnectionStatus('failed');
      }
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: `❌ ${error.response?.data?.message || 'Connection failed'}` 
      });
      setConnectionStatus('failed');
    } finally {
      setTesting(false);
    }
  };

  // Save configuration
  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });
    
    try {
      const response = await api.post('/env/db-payroll/save', config);
      
      if (response.data.success) {
        setMessage({ type: 'success', text: '✅ Configuration saved successfully!' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      } else {
        setMessage({ type: 'error', text: `❌ ${response.data.message}` });
      }
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: `❌ ${error.response?.data?.message || 'Failed to save configuration'}` 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-lg shadow-lg p-8 text-white">
        <h2 className="text-3xl font-bold mb-2">💰 Payroll Database Connection</h2>
        <p className="text-purple-100">Configure MySQL database for Payroll module</p>
      </div>

      {/* Connection Status */}
      {connectionStatus && (
        <div className={`p-4 rounded-lg border-l-4 ${
          connectionStatus === 'connected' 
            ? 'bg-green-50 border-green-500' 
            : connectionStatus === 'failed'
            ? 'bg-red-50 border-red-500'
            : 'bg-yellow-50 border-yellow-500'
        }`}>
          <div className="flex items-center space-x-2">
            {connectionStatus === 'connected' && (
              <>
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-green-700 font-medium">Database Connected</span>
              </>
            )}
            {connectionStatus === 'failed' && (
              <>
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-red-700 font-medium">Connection Failed</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Configuration Form */}
      <form onSubmit={handleSave} className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Database Configuration</h3>
        
        <div className="space-y-4">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <label className="text-sm font-medium text-gray-900">Enable Payroll Module</label>
              <p className="text-xs text-gray-600">Activate separate database for Payroll</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>

          {/* Host */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Database Host
            </label>
            <input
              type="text"
              value={config.host}
              onChange={(e) => setConfig({ ...config, host: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="localhost or IP address"
              required
            />
          </div>

          {/* Port */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Port
            </label>
            <input
              type="number"
              value={config.port}
              onChange={(e) => setConfig({ ...config, port: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="3306"
              required
            />
          </div>

          {/* Database Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Database Name
            </label>
            <input
              type="text"
              value={config.database}
              onChange={(e) => setConfig({ ...config, database: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="payroll_db"
              required
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username
            </label>
            <input
              type="text"
              value={config.username}
              onChange={(e) => setConfig({ ...config, username: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="database username"
              required
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={config.password}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 pr-10"
                placeholder="database password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Message Display */}
        {message.text && (
          <div className={`mt-4 p-4 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || !config.host || !config.database}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {testing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Testing...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Test Connection</span>
              </>
            )}
          </button>

          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                <span>Save Configuration</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Information Panel */}
      <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg">
        <div className="flex items-start space-x-3">
          <svg className="w-6 h-6 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="text-sm font-semibold text-blue-800 mb-2">About Payroll Database</h4>
            <p className="text-sm text-blue-700 mb-2">
              The Payroll module uses a separate MySQL database to store salary information, deductions, payroll history, and financial data.
            </p>
            <p className="text-sm text-blue-700">
              <strong>Purpose:</strong> Isolates sensitive financial data with stricter access controls and audit trails.
            </p>
          </div>
        </div>
      </div>

      {/* Security Notice */}
      <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg">
        <div className="flex items-start space-x-3">
          <svg className="w-6 h-6 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <div>
            <h4 className="text-sm font-semibold text-red-800 mb-2">High Security Database</h4>
            <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
              <li>Contains highly sensitive salary and financial information</li>
              <li>Only super administrators can modify this configuration</li>
              <li>Use extremely strong credentials</li>
              <li>Enable database encryption if possible</li>
              <li>Regular backups are critical</li>
              <li>Audit all access to this database</li>
              <li>Configuration is stored securely in environment variables</li>
            </ul>
          </div>
        </div>
      </div>

      {/* DTR Integration Notice */}
      <div className="bg-purple-50 border-l-4 border-purple-500 p-6 rounded-lg">
        <div className="flex items-start space-x-3">
          <svg className="w-6 h-6 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="text-sm font-semibold text-purple-800 mb-2">DTR Integration</h4>
            <p className="text-sm text-purple-700">
              The Payroll module will automatically pull attendance data from the main HR201 database (DTR system) to compute salaries accurately. 
              Employee information will be synced between databases while payroll-specific data (salaries, deductions, payslips) remain isolated.
            </p>
          </div>
        </div>
      </div>

      {/* Database Schema Info */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Expected Database Schema</h3>
        <p className="text-sm text-gray-600 mb-4">
          The Payroll database should contain tables for:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 bg-gray-50 rounded border-l-2 border-purple-500">
            <p className="text-sm font-medium text-gray-900">💵 Salary Rates</p>
            <p className="text-xs text-gray-600">Employee salary information</p>
          </div>
          <div className="p-3 bg-gray-50 rounded border-l-2 border-purple-500">
            <p className="text-sm font-medium text-gray-900">📋 Payroll Register</p>
            <p className="text-xs text-gray-600">Payroll computation records</p>
          </div>
          <div className="p-3 bg-gray-50 rounded border-l-2 border-purple-500">
            <p className="text-sm font-medium text-gray-900">📄 Payslips</p>
            <p className="text-xs text-gray-600">Generated payslip records</p>
          </div>
          <div className="p-3 bg-gray-50 rounded border-l-2 border-purple-500">
            <p className="text-sm font-medium text-gray-900">💳 Deductions</p>
            <p className="text-xs text-gray-600">SSS, PhilHealth, Pag-IBIG, Tax</p>
          </div>
          <div className="p-3 bg-gray-50 rounded border-l-2 border-purple-500">
            <p className="text-sm font-medium text-gray-900">💰 Loans & Advances</p>
            <p className="text-xs text-gray-600">Employee loan tracking</p>
          </div>
          <div className="p-3 bg-gray-50 rounded border-l-2 border-purple-500">
            <p className="text-sm font-medium text-gray-900">📊 Government Reports</p>
            <p className="text-xs text-gray-600">BIR, SSS, PhilHealth reports</p>
          </div>
          <div className="p-3 bg-gray-50 rounded border-l-2 border-purple-500">
            <p className="text-sm font-medium text-gray-900">🎁 13th Month Pay</p>
            <p className="text-xs text-gray-600">Bonus computation records</p>
          </div>
          <div className="p-3 bg-gray-50 rounded border-l-2 border-purple-500">
            <p className="text-sm font-medium text-gray-900">📈 Payroll History</p>
            <p className="text-xs text-gray-600">Historical payroll data</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DB_Payroll;

