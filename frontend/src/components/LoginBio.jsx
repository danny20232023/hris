import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import DigitalPersonaNativeClient from '../utils/digitalPersonaNativeClient';

// Custom CSS animations for better UX
const buttonStyles = `
  @keyframes readyPulse {
    0%, 100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
    }
    50% {
      transform: scale(1.02);
      box-shadow: 0 0 0 10px rgba(59, 130, 246, 0);
    }
  }
  
  @keyframes readyGlow {
    0%, 100% {
      box-shadow: 0 0 5px rgba(59, 130, 246, 0.5);
    }
    50% {
      box-shadow: 0 0 20px rgba(59, 130, 246, 0.8), 0 0 30px rgba(59, 130, 246, 0.6);
    }
  }
  
  @keyframes greenPulse {
    0%, 100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
    }
    50% {
      transform: scale(1.02);
      box-shadow: 0 0 0 10px rgba(34, 197, 94, 0);
    }
  }
  
  @keyframes greenGlow {
    0%, 100% {
      box-shadow: 0 0 5px rgba(34, 197, 94, 0.5);
    }
    50% {
      box-shadow: 0 0 20px rgba(34, 197, 94, 0.8), 0 0 30px rgba(34, 197, 94, 0.6);
    }
  }
  
  .ready-button {
    animation: readyPulse 2s infinite, readyGlow 2s infinite;
  }
  
  .green-ready-button {
    animation: greenPulse 2s infinite, greenGlow 2s infinite;
  }
`;

function LoginBio() {
  const navigate = useNavigate();
  
  // Core state management
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [readerAvailable, setReaderAvailable] = useState(false);
  const [fingerprintStatus, setFingerprintStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [debugInfo, setDebugInfo] = useState('');
  const [showDeviceSelection, setShowDeviceSelection] = useState(false);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  // REMOVED: retryCount, maxRetries, retryTimeoutRef - no auto-retry needed
  const isProcessingRef = useRef(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  
  // Refs for DigitalPersona Native client and cleanup
  const dpClientRef = useRef(null);
  const cleanupTimeoutRef = useRef(null);

  // Handle biometric login with direct PowerShell verification (VerifyFingerprint.ps1)
  const handleBiometricLogin = async () => {
    try {
      console.log('🚀 Starting direct biometric authentication (VerifyFingerprint.ps1)...');
      
      // Don't start new scans if employee not found popup is active
      if (showEmployeeNotFoundPopup) {
        console.log('🛑 Employee not found popup is active, blocking new scan');
        return;
      }
      
      // Prevent concurrent processing
      if (isProcessingRef.current) {
        console.log('🛑 Already processing a scan, ignoring new request');
        return;
      }
      
      // Set processing lock
      isProcessingRef.current = true;
      
      setIsScanning(true);
      setFingerprintStatus('Starting fingerprint scan...');
      setErrorMessage('');
      
      // Show instruction to place finger on scanner
      setFingerprintStatus('Place your finger on the scanner...');
      
      console.log('📸 Calling direct biometric login endpoint (uses VerifyFingerprint.ps1)...');
      console.log('⏳ This will capture fingerprint and verify against database in one operation...');
      setFingerprintStatus('🖐️ PLACE YOUR FINGER ON THE SCANNER NOW! (8 seconds to place finger)');
      
      // Call the direct biometric login endpoint
      // This executes VerifyFingerprint.ps1 which:
      // 1. Waits for finger detection (SPACE key press in simulation mode)
      // 2. Captures fingerprint from scanner
      // 3. Loads all templates from FingerTemplates table
      // 4. Verifies and returns matched user
      const response = await api.post('/auth/biometric-login-direct');
      const authResult = response.data;
      
      // Check if authentication was successful
      if (authResult.success && authResult.authenticated) {
        console.log('✅ Authentication successful:', authResult.user);
        setFingerprintStatus(`✅ Welcome, ${authResult.user.NAME}!`);
        
        // Store authentication data
        localStorage.setItem('authToken', authResult.token);
        localStorage.setItem('authUser', JSON.stringify(authResult.user));
        localStorage.setItem('authMethod', 'biometric');
        
        // Set authorization header for API requests
        api.defaults.headers.common['Authorization'] = `Bearer ${authResult.token}`;
        
        // Dispatch custom event to notify authContext to reload data
        window.dispatchEvent(new CustomEvent('authUpdate'));
        
        // Determine navigation route based on user privilege
        const userPrivilege = authResult.user.PRIVILEGE || authResult.user.privilege || 0;
        const isAdmin = userPrivilege > 0;
        const targetRoute = isAdmin ? '/hris-management' : '/dtr-checker';
        
        console.log(`✅ Authentication data stored, user privilege: ${userPrivilege}, navigating to ${targetRoute}...`);
        
        // Navigate to appropriate route
        setTimeout(() => {
          console.log(`🚀 Navigating to ${targetRoute}...`);
          navigate(targetRoute);
        }, 1500);
        
      } else {
        console.log('❌ Authentication failed:', authResult.message);
        setFingerprintStatus('❌ Fingerprint not recognized');
        setErrorMessage(authResult.message || 'Authentication failed - fingerprint not found in database');
        
        // Show employee not found popup with auto-close timer
        showEmployeeNotFoundPopupWithTimer();
        
        // Keep scanning state active for retry
        console.log('🔄 Keeping scanning state active for retry...');
        setFingerprintStatus('❌ Fingerprint not recognized - Click "Scan Finger" to try again');
        setIsScanning(false); // Allow user to click Scan Finger again
      }
      
    } catch (error) {
      console.error('❌ Direct biometric authentication failed:', error);
      
      // Parse error response if available
      const errorMessage = error.response?.data?.message || error.message;
      
      // Handle different error types
      if (errorMessage.includes('timeout') || errorMessage.includes('No finger detected') || errorMessage.includes('No fingerprint captured')) {
        setFingerprintStatus('❌ No finger detected');
        setErrorMessage('No finger detected on scanner. Please place your finger and try again (press SPACE in simulation mode).');
        console.log('🔄 No finger detected - stopping scan, user can retry');
        setIsScanning(false);
      } else if (errorMessage.includes('No fingerprint templates found')) {
        setFingerprintStatus('❌ No enrolled fingerprints');
        setErrorMessage('No fingerprints enrolled in the system. Please enroll your fingerprint first.');
        console.log('❌ Database has no enrolled fingerprints');
        setIsScanning(false);
      } else if (errorMessage.includes('not recognized') || errorMessage.includes('not found')) {
        setFingerprintStatus('❌ Fingerprint not recognized');
        setErrorMessage('Your fingerprint was not recognized. Please try again or contact administrator.');
        showEmployeeNotFoundPopupWithTimer();
        setIsScanning(false);
      } else if (errorMessage.includes('SDK') || errorMessage.includes('not available')) {
        setFingerprintStatus('❌ SDK not available');
        setErrorMessage('DigitalPersona SDK is not available. Please check SDK installation.');
        setDebugInfo(errorMessage);
        setIsScanning(false);
      } else {
        setFingerprintStatus('❌ Scan failed');
        setErrorMessage(errorMessage || 'Fingerprint scan failed');
          showEmployeeNotFoundPopupWithTimer();
        setIsScanning(false); // Stop scanning, user can retry manually
      }
    } finally {
      // Clear processing lock
      isProcessingRef.current = false;
      console.log('🔄 Direct biometric login attempt completed');
    }
  };

  // Function to stop scanning
  const handleStopScanning = () => {
    console.log('🛑 Stopping fingerprint scanning...');
    
    // Reset scanning state
    setIsScanning(false);
    setFingerprintStatus('Scan stopped by user');
    setErrorMessage('');
    
    // Clear processing lock
    isProcessingRef.current = false;
    
    // If there's any ongoing capture or operation, it will be cancelled
    console.log('✅ Scanning stopped successfully');
  };

  // Function to close employee not found popup
  const closeEmployeeNotFoundPopup = () => {
    // Clear any existing countdown interval
    if (popupCountdownInterval) {
      clearInterval(popupCountdownInterval);
      setPopupCountdownInterval(null);
    }
    
    // Close popup and reset state
    setShowEmployeeNotFoundPopup(false);
    setPopupCountdown(0);
    setErrorMessage('');
    setFingerprintStatus('Ready to scan');
    
    // Resume scanning if we were in scanning state
    if (isScanning) {
      console.log('🔄 Popup closed, resuming automatic scanning...');
      setFingerprintStatus('Ready to scan - Place finger on scanner...');
      // Scanning state is always active - no timeout needed
    }
  };

  // Function to show employee not found popup with auto-close timer
  const showEmployeeNotFoundPopupWithTimer = () => {
    setShowEmployeeNotFoundPopup(true);
    setPopupCountdown(10); // Start countdown at 10 seconds
    
    // Create countdown interval that handles both countdown and auto-close
    const countdownInterval = setInterval(() => {
      setPopupCountdown(prev => {
        if (prev <= 1) {
          // Clear the interval and close popup
          clearInterval(countdownInterval);
          setPopupCountdownInterval(null);
          setShowEmployeeNotFoundPopup(false);
          setPopupCountdown(0);
          setErrorMessage('');
          setFingerprintStatus('Ready to scan');
          
          // Resume scanning if we were in scanning state
          if (isScanning) {
            console.log('🔄 Popup auto-closed, resuming automatic scanning...');
            setFingerprintStatus('Ready to scan - Place finger on scanner...');
            // Scanning state is always active - no timeout needed
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    setPopupCountdownInterval(countdownInterval);
  };

  // Initialize DigitalPersona helper on component mount
  useEffect(() => {
    console.log('🚀 LoginBio: Initializing DigitalPersona biometric system...');
    
    const initializeSystem = async () => {
      try {
        // Reset all states
        resetStates();
        
        console.log('✅ Initializing DigitalPersona PowerShell Win32 SDK Client...');
        
        // Create and initialize native client
        dpClientRef.current = new DigitalPersonaNativeClient();
        
        await dpClientRef.current.initialize();
        
        console.log('✅ DigitalPersona PowerShell Win32 SDK Client initialized successfully');
        setDebugInfo('');
        setIsInitialized(true);
        setReaderAvailable(true);
        
        // Start device detection after initialization
        setTimeout(() => {
          detectDevices();
        }, 1000);
        
      } catch (error) {
        console.error('❌ Failed to initialize DigitalPersona Native system:', error);
        setDebugInfo(`Initialization failed: ${error.message}`);
        setLoadingDevices(false);
        setIsInitialized(false);
        setReaderAvailable(false);
      }
    };
    
    initializeSystem();
    
    // Cleanup on unmount
    return () => {
      cleanup();
    };
  }, []);

  // Reset all component states
  const resetStates = () => {
    setSelectedDevice(null);
    setSelectedDeviceId('');
    setIsInitialized(false);
    setReaderAvailable(false);
    setFingerprintStatus('');
    setErrorMessage('');
    setDebugInfo('');
    setShowDeviceSelection(false);
    setAvailableDevices([]);
    setLoadingDevices(true);
    setIsScanning(false);
  };

  // Cleanup DigitalPersona helper
  const cleanup = () => {
    console.log('🧹 Cleaning up DigitalPersona system...');
    
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
    }
    
    // Cleanup finger detection functions
    if (window.fingerDetectionResolve) {
      delete window.fingerDetectionResolve;
    }
    if (window.fingerDetectionReject) {
      delete window.fingerDetectionReject;
    }
    
    if (dpClientRef.current) {
      try {
        // Native client doesn't need explicit cleanup
        dpClientRef.current = null;
      } catch (error) {
        console.error('⚠️ Cleanup error:', error);
      }
    }
  };

  // Detect available DigitalPersona devices using native SDK
  const detectDevices = async () => {
    try {
        console.log('🔍 Detecting DigitalPersona devices via PowerShell Win32 SDK...');
      setLoadingDevices(true);
      setDebugInfo('Scanning for devices...');
      
      if (!dpClientRef.current) {
        throw new Error('DigitalPersona PowerShell Win32 SDK client not initialized');
      }
      
      // Get devices from PowerShell Win32 SDK
      const devices = await dpClientRef.current.getDevices();
      
      console.log('📊 PowerShell Win32 SDK device detection result:', devices);
      
      // Handle both single device object and array of devices
      let deviceList = [];
      if (devices) {
        if (Array.isArray(devices)) {
          deviceList = devices;
        } else if (devices.devices && Array.isArray(devices.devices)) {
          deviceList = devices.devices;
        } else if (devices.id !== undefined || devices.name !== undefined) {
          // Single device object
          deviceList = [devices];
        }
      }
      
      if (deviceList.length > 0) {
        const formattedDevices = deviceList.map((device, index) => ({
          id: device.id || device.Id || index,
          name: device.name || device.Name || `DigitalPersona Scanner ${index + 1}`,
          type: 'digitalPersona',
          status: 'connected',
          details: `Model: ${device.model || device.Model || 'Unknown'}`
        }));
        
        console.log('✅ DigitalPersona devices found:', formattedDevices);
        setAvailableDevices(formattedDevices);
        setShowDeviceSelection(false); // Go directly to main interface with dropdown
        setLoadingDevices(false);
        setDebugInfo(`${formattedDevices.length} device(s) detected`);
        
        // Auto-select if only one device
        if (formattedDevices.length === 1) {
          console.log('🔄 Auto-selecting single device...');
          setTimeout(() => {
            handleDeviceSelectionWithDevice(formattedDevices[0]);
          }, 500);
        } else {
          // Multiple devices - show dropdown on main interface
          // Set a placeholder device to show the interface
          setSelectedDevice({ id: '', name: 'Please select a device', type: 'placeholder' });
        }
      } else {
        console.log('⚠️ No DigitalPersona devices detected');
        setAvailableDevices([]);
        setShowDeviceSelection(false); // Stay on main interface
        // Set a placeholder to show the interface even with no devices
        setSelectedDevice({ id: '', name: 'No device', type: 'placeholder' });
        setLoadingDevices(false);
        setDebugInfo('No devices detected - check connection');
      }
      
    } catch (error) {
      console.error('❌ Device detection failed:', error);
      setAvailableDevices([]);
      setShowDeviceSelection(false); // Stay on main interface
      setSelectedDevice({ id: '', name: 'Device detection failed', type: 'placeholder' });
      setLoadingDevices(false);
      setDebugInfo(`Detection failed: ${error.message}`);
    }
  };

  // Handle device selection - simplified without fallback logic
  // Handle device selection with device object (for auto-selection)
  const handleDeviceSelectionWithDevice = async (device) => {
    try {
      console.log('🔍 handleDeviceSelectionWithDevice called with:', device);
      console.log('🔍 Device ID:', device?.id);
      console.log('🔍 Device name:', device?.name);
      
      if (!device) {
        console.error('❌ No device provided for selection');
        setErrorMessage('Device selection failed: No device provided');
        return;
      }
      
      // Set the selected device directly
      setSelectedDevice(device);
      setSelectedDeviceId(device.id);
      setShowDeviceSelection(false); // Hide device selection interface
      setErrorMessage('');
      setDebugInfo(`Selected device: ${device.name} (${device.id})`);
      
      // Initialize the device
      await initializeDevice(device);
      
    } catch (error) {
      console.error('❌ Device selection failed:', error);
      setErrorMessage(`Device selection failed: ${error.message}`);
    }
  };

  // Handle device selection from dropdown
  const handleDeviceSelection = async (deviceId) => {
    try {
      console.log('🔍 handleDeviceSelection called with deviceId:', deviceId);
      
      if (!deviceId) {
        setSelectedDevice(null);
        setSelectedDeviceId('');
        return;
      }
      
      // Find the device object from availableDevices
      const device = availableDevices.find(d => String(d.id) === String(deviceId));
      
      if (!device) {
        console.error('❌ Device not found in availableDevices');
        setErrorMessage('Selected device not found');
        return;
      }
      
      console.log('✅ Device found, calling handleDeviceSelectionWithDevice:', device);
      
      // Use the unified device selection function
      await handleDeviceSelectionWithDevice(device);
      
    } catch (error) {
      console.error('❌ Device selection failed:', error);
      setErrorMessage(`Device selection failed: ${error.message}`);
    }
  };

  // Initialize the selected DigitalPersona device
  const initializeDevice = async (device) => {
    try {
      console.log('🔧 Initializing DigitalPersona device:', device.name);
      
      if (!dpClientRef.current) {
        throw new Error('DigitalPersona PowerShell Win32 SDK client not available');
      }
      
      // Ensure client is ready
      if (!dpClientRef.current.isInitialized()) {
        await dpClientRef.current.initialize();
      }
      
      setIsInitialized(true);
      setReaderAvailable(true);
      setFingerprintStatus('Device is ready - Click "Scan Finger" to start ');
      setDebugInfo('');
      
      console.log('✅ DigitalPersona device ready for scanning');
      console.log('🔍 Current state after initialization:', {
        isInitialized: true,
        readerAvailable: true,
        selectedDevice: device,
        showDeviceSelection: false
      });
      
    } catch (error) {
      console.error('❌ Device initialization failed:', error);
      setFingerprintStatus('Device initialization failed');
      setErrorMessage(`Initialization error: ${error.message}`);
    }
  };

  // Add service restart instructions component
  const ServiceRestartInstructions = ({ onClose }) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-red-600 mb-4">
          🔧 DigitalPersona PowerShell Win32 SDK Communication Issue
        </h3>
        <p className="text-gray-700 mb-4">
          The fingerprint scanner is experiencing communication errors with the PowerShell Win32 SDK.
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-800">
            <strong>Architecture:</strong> Web App → Node.js → PowerShell Win32 SDK → DigitalPersona Runtime → Fingerprint Hardware
          </p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-yellow-800">
            <strong>Technical Details:</strong> PowerShell Win32 SDK communication errors indicate issues with the PowerShell execution or DigitalPersona device drivers.
          </p>
        </div>
        <div className="space-y-3">
          <h4 className="font-semibold text-gray-800">Quick Fix:</h4>
          <div className="bg-gray-100 rounded-lg p-3 font-mono text-sm">
            <div className="text-gray-600"># Restart DigitalPersona services</div>
            <div>net stop DpHost</div>
            <div>Start-Sleep -Seconds 3</div>
            <div>net start DpHost</div>
            <div className="text-gray-600"># Restart the web application</div>
            <div>Refresh the page or restart the backend server</div>
          </div>
          <p className="text-xs text-gray-500">
            Or use services.msc to restart "DigitalPersona Authentication Service"
          </p>
        </div>
        <div className="flex flex-col space-y-3 mt-6">
          <div className="flex space-x-3">
            <button
              onClick={handleServiceRestart}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Reinitialize PowerShell Win32 SDK
            </button>
            <button
              onClick={handleJsonErrorRecovery}
              className="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Reset PowerShell Win32 SDK
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-full bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  // Add state for service restart dialog
  const [showServiceRestartDialog, setShowServiceRestartDialog] = useState(false);
  const [showEmployeeNotFoundPopup, setShowEmployeeNotFoundPopup] = useState(false);
  const [popupCountdownInterval, setPopupCountdownInterval] = useState(null);
  const [popupCountdown, setPopupCountdown] = useState(0);

  // Cleanup timers on component unmount
  useEffect(() => {
    return () => {
      if (popupCountdownInterval) {
        clearInterval(popupCountdownInterval);
      }
    };
  }, [popupCountdownInterval]);


  // Handle PowerShell Win32 SDK reinitialization
  const handleServiceRestart = async () => {
    try {
      setShowServiceRestartDialog(false);
      setFingerprintStatus('Reinitializing PowerShell Win32 SDK...');
      setErrorMessage('');
      
      if (dpClientRef.current) {
        // For PowerShell Win32 SDK, we just reinitialize instead of restarting services
        await dpClientRef.current.initialize();
        setFingerprintStatus('✅ PowerShell Win32 SDK reinitialized successfully');
        setErrorMessage('');
        // Try to reinitialize and detect devices
        setTimeout(() => {
          detectDevices();
        }, 2000);
      } else {
        throw new Error('DigitalPersona PowerShell Win32 SDK client not available');
      }
    } catch (error) {
      console.error('PowerShell Win32 SDK reinitialization error:', error);
      setFingerprintStatus('❌ PowerShell Win32 SDK reinitialization failed');
      setErrorMessage('Failed to reinitialize PowerShell Win32 SDK. Please try again.');
      setShowServiceRestartDialog(true);
    }
  };

  // Handle PowerShell Win32 SDK error recovery
  const handleJsonErrorRecovery = async () => {
    try {
      setFingerprintStatus('Attempting PowerShell Win32 SDK error recovery...');
      setErrorMessage('');
      
      if (dpClientRef.current) {
        // Attempt to reinitialize the PowerShell Win32 SDK
        console.log('🔧 Attempting PowerShell Win32 SDK reinitialization...');
        
        try {
          await dpClientRef.current.initialize();
          console.log('✅ PowerShell Win32 SDK reinitialization successful');
          setShowServiceRestartDialog(false);
          setFingerprintStatus('Ready to scan - please try again');
          setErrorMessage('');
        } catch (error) {
          console.error('❌ PowerShell Win32 SDK reinitialization failed:', error);
          setErrorMessage('Failed to reinitialize PowerShell Win32 SDK. Please restart the application.');
        }
      } else {
        throw new Error('DigitalPersona PowerShell Win32 SDK client not available');
      }
    } catch (error) {
      console.error('PowerShell Win32 SDK recovery error:', error);
      setFingerprintStatus('❌ PowerShell Win32 SDK recovery failed');
      setErrorMessage('PowerShell Win32 SDK recovery failed. Please restart the application.');
      setShowServiceRestartDialog(true);
    }
  };


  // Handle biometric login with fingerprint scanning

  // Retry device detection
  const retryDeviceDetection = () => {
    console.log('🔄 Retrying device detection...');
    setErrorMessage('');
    setDebugInfo('Retrying device detection...');
    detectDevices();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
      <style dangerouslySetInnerHTML={{ __html: buttonStyles }} />
      
      {/* Service Restart Dialog */}
      {showServiceRestartDialog && (
        <ServiceRestartInstructions 
          onClose={() => {
            setShowServiceRestartDialog(false);
            setErrorMessage('');
            setFingerprintStatus('Ready to scan - please try again');
          }} 
        />
      )}

      {/* Employee Not Found Popup */}
      {showEmployeeNotFoundPopup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 transform animate-in zoom-in-95 duration-300">
            <div className="text-center">
              {/* Icon */}
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-6">
                <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>

              {/* Title */}
              <h3 className="text-2xl font-bold text-gray-900 mb-4">EMPLOYEE NOT FOUND!</h3>

              {/* Message */}
              <p className="text-gray-600 mb-4">
                The fingerprint you scanned does not match any registered employee in the system.
                <br />
                <br />
                Please contact your administrator to enroll your fingerprint or try scanning again.
              </p>

              {/* Countdown Timer */}
              {popupCountdown > 0 && (
                <div className="mb-6">
                  <div className="bg-gray-100 rounded-lg p-3">
                    <p className="text-sm text-gray-600 mb-2">This popup will close automatically in:</p>
                    <div className="text-2xl font-bold text-red-600">{popupCountdown}</div>
                  </div>
                </div>
              )}

              {/* Button */}
              <button
                onClick={closeEmployeeNotFoundPopup}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Try Again (or wait {popupCountdown}s)
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* SDK Initialization Loading Animation */}
      {loadingDevices && availableDevices.length === 0 && (
      <div className="w-full max-w-md">
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 p-12">
            <div className="text-center">
              {/* Animated Fingerprint Icon */}
              <div className="mb-8 flex justify-center">
                <div className="relative">
                  <svg 
                    className="w-24 h-24 text-blue-400 animate-pulse"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"/>
                  </svg>
                  {/* Rotating ring around the icon */}
                  <div className="absolute inset-0 rounded-full border-4 border-blue-400/30 border-t-blue-400 animate-spin"></div>
                </div>
              </div>
              
              {/* Loading text */}
              <h2 className="text-2xl font-bold text-white mb-3">Initializing SDK</h2>
              <p className="text-white/70 mb-6">Setting up fingerprint authentication...</p>
              
              {/* Loading dots animation */}
              <div className="flex justify-center space-x-2">
                <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>

              {/* Progress bar */}
              <div className="mt-8 w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full animate-pulse" style={{ width: '60%' }}></div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Main Interface - Only show when not in initial loading */}
      {(!loadingDevices || availableDevices.length > 0 || selectedDevice) && (
      <div className="w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 p-8">
          {/* Main Authentication Interface */}
          {!showDeviceSelection && selectedDevice && (
            <div className="space-y-6">
                
              {/* Device Selector Dropdown */}
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <label className="block text-white/90 text-sm font-medium mb-2">
                  Select Fingerprint Scanner
                </label>
                {loadingDevices ? (
                  <div className="flex items-center justify-center py-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    <span className="text-white/70 text-sm">Detecting devices...</span>
                  </div>
                ) : (
                      <select
                        value={selectedDeviceId}
                        onChange={(e) => handleDeviceSelection(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800/80 border border-gray-600/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      >
                        <option value="">Choose a fingerprint scanner...</option>
                        {availableDevices.map((device) => (
                          <option key={device.id} value={device.id}>
                            {device.name}
                          </option>
                        ))}
                      </select>
                )}
                {availableDevices.length === 0 && !loadingDevices && (
                  <div className="mt-3 p-3 bg-red-500/20 border border-red-400/30 rounded-lg">
                    <p className="text-red-300 text-sm">
                      ⚠️ No fingerprint scanners detected. Please check your device connection.
                    </p>
                          <button
                            onClick={retryDeviceDetection}
                      className="mt-2 px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-sm rounded transition-all"
                          >
                            🔄 Retry Detection
                          </button>
                  </div>
                )}
              </div>

              {/* Fingerprint Scanner Interface */}
              <div className="space-y-4">
                <div className="text-center">
                  <h4 className="text-lg font-semibold text-white mb-2">Fingerprint Authentication</h4>
                  <p className="text-white/70 text-sm mb-4">
                    Place your finger on the scanner to authenticate
                  </p>
                </div>

                {/* Status Indicator */}
                <div className="flex items-center justify-center space-x-2 mb-4">
                  <div className={`w-3 h-3 rounded-full ${
                    isInitialized && readerAvailable 
                      ? 'bg-green-400 animate-pulse' 
                      : isInitialized 
                      ? 'bg-yellow-400 animate-pulse' 
                      : 'bg-red-400'
                  }`}></div>
                  <span className={`text-sm ${
                    isInitialized && readerAvailable 
                      ? 'text-green-300' 
                      : isInitialized 
                      ? 'text-yellow-300' 
                      : 'text-red-300'
                  }`}>
                    {isInitialized && readerAvailable 
                      ? 'Ready to Scan' 
                      : isInitialized 
                      ? 'Initializing...' 
                      : 'Not Ready'
                    }
                  </span>
                </div>

                {/* Fingerprint Icon Display */}
                <div className="mb-6 flex justify-center">
                  <div className={`relative transition-all duration-500 ${isScanning ? 'animate-pulse' : ''}`}>
                    {/* Fingerprint SVG Icon */}
                    <svg 
                      className={`w-32 h-32 transition-all duration-500 ${
                        isScanning 
                          ? 'text-blue-400 drop-shadow-[0_0_20px_rgba(59,130,246,0.8)]' 
                          : 'text-white/60'
                      }`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"/>
                    </svg>
                    
                    {/* Glowing rings when scanning */}
                    {isScanning && (
                      <>
                        <div className="absolute inset-0 rounded-full border-4 border-blue-400/30 animate-ping"></div>
                        <div className="absolute inset-0 rounded-full border-2 border-blue-500/50 animate-pulse"></div>
                      </>
                    )}
                      </div>
                      </div>

                {/* Scan Button / Stop Button */}
                {isScanning ? (
                  <button
                    onClick={handleStopScanning}
                    className="w-full px-6 py-4 text-white font-semibold rounded-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-red-500 bg-red-600 hover:bg-red-700"
                  >
                    <div className="flex items-center justify-center">
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span>Stop Scanning</span>
                    </div>
                  </button>
                ) : (
                <button
                  onClick={handleBiometricLogin}
                  disabled={!isInitialized || !readerAvailable}
                  className={`w-full px-6 py-4 text-white font-semibold rounded-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isInitialized && readerAvailable
                      ? 'bg-blue-600 hover:bg-blue-700 ready-button'
                      : 'bg-gray-600 cursor-not-allowed opacity-50'
                  }`}
                >
                  <div className="flex items-center justify-center">
                      {isInitialized && readerAvailable ? (
                        <>
                          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                        </svg>
                          <span>Scan Finger</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        {isInitialized ? 'Initializing...' : 'Start Fingerprint Scan'}
                      </>
                    )}
                  </div>
                </button>
                )}
                
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={() => navigate('/login')}
                  className="w-full py-2 px-4 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg border border-white/20 transition-all"
                >
                  ← Back to Login
                </button>
              </div>

              {/* Status Messages */}
              {fingerprintStatus && (
                <div className={`text-center px-4 py-3 rounded-lg ${
                  fingerprintStatus.includes('✅') || fingerprintStatus.includes('Welcome')
                    ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                    : fingerprintStatus.includes('❌') || fingerprintStatus.includes('failed')
                    ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                    : fingerprintStatus.includes('Waiting for finger') || fingerprintStatus.includes('Detecting finger')
                    ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                }`}>
                  {fingerprintStatus}
                </div>
              )}

               {/* Finger Detection Indicator */}
               {(fingerprintStatus.includes('Waiting for finger') || fingerprintStatus.includes('Detecting finger')) && (
                 <div className="text-center px-4 py-3 rounded-lg bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                   <div className="flex items-center justify-center">
                     <svg className="w-5 h-5 mr-2 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                     </svg>
                     <span className="animate-pulse">Touch the scanner surface with your finger</span>
                   </div>
                   
                   {/* Real SDK Finger Detection */}
                   <div className="mt-3 space-y-2">
                     <p className="text-xs text-yellow-200">DigitalPersona Real SDK - touch the scanner surface</p>
                     <p className="text-xs text-yellow-300">Using actual hardware detection with DigitalPersona SDK</p>
                     <p className="text-xs text-green-300">✅ Real SDK: Hardware-based finger detection active</p>
                   </div>
                 </div>
               )}


              {/* Debug Info */}
              {debugInfo && (
                <div className="text-xs text-white/60 bg-black/20 p-3 rounded border border-white/10">
                  <strong>Debug:</strong> {debugInfo}
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="mt-4 p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
              <div className="text-red-300 text-sm whitespace-pre-line">{errorMessage}</div>
            </div>
          )}

          </div>
        </div>
      )}
    </div>
  );
}

export default LoginBio;

