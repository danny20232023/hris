import React, { useState, useEffect } from 'react';
import { useAuth } from '../../authContext';
import api from '../../utils/api';
import DigitalPersonaNativeClient from '../../utils/digitalPersonaNativeClient';

const DtrCheckerKiosk = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  
  // Device configuration states
  const [localDevices, setLocalDevices] = useState([]);
  const [networkMachines, setNetworkMachines] = useState([]);
  const [currentConfig, setCurrentConfig] = useState({
    dtrCheckerDevice: null,
    loginBioDevice: null,
    enableDigitalPersona: true,
    enableNetworkMachines: true,
    autoDetectDevices: true
  });
  
  // Device detection states
  const [detectingDevices, setDetectingDevices] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState({
    digitalPersona: 'unknown',
    networkMachines: 'unknown'
  });

  // Initialize DigitalPersona helper
  const dpHelper = new DigitalPersonaHelper();

  useEffect(() => {
    loadConfiguration();
    detectDevices();
  }, []);

  const loadConfiguration = async () => {
    try {
      setLoading(true);
      const response = await api.get('/settings/kiosk-config');
      if (response.data.success) {
        setCurrentConfig(response.data.config);
      }
    } catch (error) {
      console.error('Failed to load kiosk configuration:', error);
      setError('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const saveConfiguration = async () => {
    try {
      setSaving(true);
      setError('');
      
      // Validate configuration
      if (currentConfig.enableDigitalPersona && !currentConfig.loginBioDevice && localDevices.length > 0) {
        throw new Error('Please select a DigitalPersona device for biometric login');
      }
      
      if (currentConfig.enableNetworkMachines && !currentConfig.dtrCheckerDevice && networkMachines.length > 0) {
        throw new Error('Please select a network machine for DTR checking');
      }

      const response = await api.post('/settings/kiosk-config', {
        config: currentConfig
      });
      
      if (response.data.success) {
        setMessage('Configuration saved successfully');
        setTimeout(() => setMessage(''), 3000);
      } else {
        throw new Error(response.data.message || 'Failed to save configuration');
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      setError(error.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const detectDevices = async () => {
    setDetectingDevices(true);
    setMessage('Detecting available devices...');
    
    try {
      // Detect DigitalPersona devices
      await detectDigitalPersonaDevices();
      
      // Detect network machines
      await detectNetworkMachines();
      
      setMessage('Device detection completed');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Device detection error:', error);
      setError('Device detection failed: ' + error.message);
    } finally {
      setDetectingDevices(false);
    }
  };

  const detectDigitalPersonaDevices = async () => {
    try {
      console.log('🔍 Detecting DigitalPersona devices...');
      const devices = await dpHelper.getDevices();
      
      setLocalDevices(devices);
      
      if (devices.length > 0) {
        setDeviceStatus(prev => ({ ...prev, digitalPersona: 'connected' }));
        console.log(`✅ Found ${devices.length} DigitalPersona device(s)`);
        
        // Auto-select first device if none selected
        if (!currentConfig.loginBioDevice && devices.length > 0) {
          setCurrentConfig(prev => ({
            ...prev,
            loginBioDevice: devices[0].serialNumber || devices[0].name
          }));
        }
      } else {
        setDeviceStatus(prev => ({ ...prev, digitalPersona: 'not_found' }));
        console.log('⚠️ No DigitalPersona devices found');
      }
    } catch (error) {
      console.error('❌ DigitalPersona detection failed:', error);
      setDeviceStatus(prev => ({ ...prev, digitalPersona: 'error' }));
      throw error;
    }
  };

  const detectNetworkMachines = async () => {
    try {
      console.log('🔍 Detecting network machines...');
      const response = await api.get('/machines/network');
      
      if (response.data.success) {
        const machines = response.data.machines || [];
        setNetworkMachines(machines);
        
        if (machines.length > 0) {
          setDeviceStatus(prev => ({ ...prev, networkMachines: 'connected' }));
          console.log(`✅ Found ${machines.length} network machine(s)`);
          
          // Auto-select first machine if none selected
          if (!currentConfig.dtrCheckerDevice && machines.length > 0) {
            setCurrentConfig(prev => ({
              ...prev,
              dtrCheckerDevice: machines[0].id
            }));
          }
        } else {
          setDeviceStatus(prev => ({ ...prev, networkMachines: 'not_found' }));
          console.log('⚠️ No network machines found');
        }
      }
    } catch (error) {
      console.error('❌ Network machine detection failed:', error);
      setDeviceStatus(prev => ({ ...prev, networkMachines: 'error' }));
      // Don't throw error for network machines as they might not be available
    }
  };

  const testDevice = async (deviceType, deviceId) => {
    try {
      setMessage(`Testing ${deviceType} device...`);
      
      if (deviceType === 'digitalPersona') {
        const device = localDevices.find(d => d.serialNumber === deviceId || d.name === deviceId);
        if (device) {
          // Test DigitalPersona device
          const testResult = await dpHelper.checkDeviceStatus();
          if (testResult.connected) {
            setMessage(`✅ DigitalPersona device test successful`);
          } else {
            throw new Error('Device not responding');
          }
        }
      } else if (deviceType === 'network') {
        const response = await api.post('/machines/test-connection', {
          machineId: deviceId
        });
        
        if (response.data.success) {
          setMessage(`✅ Network machine test successful`);
        } else {
          throw new Error(response.data.message || 'Connection test failed');
        }
      }
      
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setError(`Device test failed: ${error.message}`);
      setTimeout(() => setError(''), 5000);
    }
  };

  const getDeviceStatusBadge = (status) => {
    const statusConfig = {
      connected: { color: 'bg-green-100 text-green-800', text: 'Connected' },
      not_found: { color: 'bg-yellow-100 text-yellow-800', text: 'Not Found' },
      error: { color: 'bg-red-100 text-red-800', text: 'Error' },
      unknown: { color: 'bg-gray-100 text-gray-800', text: 'Unknown' }
    };
    
    const config = statusConfig[status] || statusConfig.unknown;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.text}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">DTR Checker Kiosk Settings</h2>
            <p className="mt-1 text-sm text-gray-600">
              Configure biometric devices for DTR checking and login authentication
            </p>
          </div>
          <button
            onClick={detectDevices}
            disabled={detectingDevices}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {detectingDevices ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Detecting...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Detect Devices
              </>
            )}
          </button>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">{message}</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Device Status Overview */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Device Status Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center">
              <svg className="w-8 h-8 text-blue-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-900">DigitalPersona Devices</p>
                <p className="text-xs text-gray-500">{localDevices.length} device(s) found</p>
              </div>
            </div>
            {getDeviceStatusBadge(deviceStatus.digitalPersona)}
          </div>
          
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center">
              <svg className="w-8 h-8 text-green-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-900">Network Machines</p>
                <p className="text-xs text-gray-500">{networkMachines.length} machine(s) found</p>
              </div>
            </div>
            {getDeviceStatusBadge(deviceStatus.networkMachines)}
          </div>
        </div>
      </div>

      {/* DigitalPersona Configuration */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">DigitalPersona Biometric Login</h3>
          <label className="inline-flex items-center">
            <input
              type="checkbox"
              checked={currentConfig.enableDigitalPersona}
              onChange={(e) => setCurrentConfig(prev => ({
                ...prev,
                enableDigitalPersona: e.target.checked
              }))}
              className="form-checkbox h-4 w-4 text-blue-600 transition duration-150 ease-in-out"
            />
            <span className="ml-2 text-sm text-gray-700">Enable DigitalPersona</span>
          </label>
        </div>
        
        {currentConfig.enableDigitalPersona && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Device for LoginBio Authentication
              </label>
              <select
                value={currentConfig.loginBioDevice || ''}
                onChange={(e) => setCurrentConfig(prev => ({
                  ...prev,
                  loginBioDevice: e.target.value
                }))}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                disabled={localDevices.length === 0}
              >
                <option value="">
                  {localDevices.length === 0 ? 'No DigitalPersona devices found' : 'Select a device'}
                </option>
                {localDevices.map((device, index) => (
                  <option key={index} value={device.serialNumber || device.name}>
                    {device.name || device.serialNumber || `Device ${index + 1}`}
                  </option>
                ))}
              </select>
            </div>
            
            {currentConfig.loginBioDevice && (
              <button
                onClick={() => testDevice('digitalPersona', currentConfig.loginBioDevice)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Test Device
              </button>
            )}
          </div>
        )}
      </div>

      {/* Network Machine Configuration */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Network Biometric Machines</h3>
          <label className="inline-flex items-center">
            <input
              type="checkbox"
              checked={currentConfig.enableNetworkMachines}
              onChange={(e) => setCurrentConfig(prev => ({
                ...prev,
                enableNetworkMachines: e.target.checked
              }))}
              className="form-checkbox h-4 w-4 text-blue-600 transition duration-150 ease-in-out"
            />
            <span className="ml-2 text-sm text-gray-700">Enable Network Machines</span>
          </label>
        </div>
        
        {currentConfig.enableNetworkMachines && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Machine for DTR Checker
              </label>
              <select
                value={currentConfig.dtrCheckerDevice || ''}
                onChange={(e) => setCurrentConfig(prev => ({
                  ...prev,
                  dtrCheckerDevice: e.target.value
                }))}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                disabled={networkMachines.length === 0}
              >
                <option value="">
                  {networkMachines.length === 0 ? 'No network machines found' : 'Select a machine'}
                </option>
                {networkMachines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.name} ({machine.ip_address})
                  </option>
                ))}
              </select>
            </div>
            
            {currentConfig.dtrCheckerDevice && (
              <button
                onClick={() => testDevice('network', currentConfig.dtrCheckerDevice)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Test Connection
              </button>
            )}
          </div>
        )}
      </div>

      {/* Global Settings */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Global Settings</h3>
        <div className="space-y-4">
          <label className="inline-flex items-center">
            <input
              type="checkbox"
              checked={currentConfig.autoDetectDevices}
              onChange={(e) => setCurrentConfig(prev => ({
                ...prev,
                autoDetectDevices: e.target.checked
              }))}
              className="form-checkbox h-4 w-4 text-blue-600 transition duration-150 ease-in-out"
            />
            <span className="ml-2 text-sm text-gray-700">Auto-detect devices on startup</span>
          </label>
        </div>
      </div>

      {/* Save Configuration */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-end space-x-3">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Reset
          </button>
          <button
            onClick={saveConfiguration}
            disabled={saving}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {saving ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </>
            ) : (
              'Save Configuration'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DtrCheckerKiosk;

