import api from './api';

class DigitalPersonaNativeClient {
  constructor() {
    this.initialized = false;
    this.deviceConnected = false;
    this.deviceList = [];
    
    console.log('🏗️ DigitalPersonaNativeClient constructor completed');
  }

  async initialize() {
    try {
      console.log('🚀 Starting DigitalPersona PowerShell Win32 SDK Client initialization...');
      
      // Check if backend native SDK is available
      const response = await api.get('/auth/digitalpersona-status');
      
      if (response.data.success) {
        this.initialized = true;
        this.deviceConnected = response.data.deviceConnected;
        this.deviceList = response.data.devices || [];
        this.fallbackMode = response.data.fallbackMode || false;
        
        console.log('✅ DigitalPersona PowerShell Win32 SDK Client initialized:', {
          initialized: this.initialized,
          deviceConnected: this.deviceConnected,
          deviceCount: this.deviceList.length,
          fallbackMode: this.fallbackMode
        });
        
        if (this.fallbackMode) {
          console.log('⚠️ Running in fallback mode - biometric features not available');
        }
      } else {
        throw new Error(response.data.message || 'Failed to initialize native SDK');
      }
      
      return this.initialized;
    } catch (error) {
        console.error('❌ Failed to initialize DigitalPersona PowerShell Win32 SDK Client:', error);
      this.initialized = false;
      this.deviceConnected = false;
      throw error;
    }
  }

  async captureFingerprint(timeout = 30000) {
    try {
      if (!this.initialized) {
        throw new Error('DigitalPersona not initialized');
      }
      
      console.log('📸 Requesting fingerprint capture from backend...');
      
      const response = await api.post('/auth/capture-fingerprint', {
        timeout: timeout
      });
      
      if (response.data.success) {
        console.log('✅ Fingerprint captured successfully');
        
        // Handle simulated/fallback responses
        if (response.data.isSimulated) {
          console.log('📝 Simulated capture response:', response.data.note);
          response.data.fingerprintData.isSimulated = true;
          response.data.fingerprintData.note = response.data.note;
          response.data.fingerprintData.deviceName = response.data.deviceName;
        }
        
        return response.data.fingerprintData;
      } else {
        throw new Error(response.data.message || 'Fingerprint capture failed');
      }
    } catch (error) {
      console.error('❌ Fingerprint capture failed:', error);
      
      // Handle native library issues gracefully
      if (error.response?.data?.nativeLibraryIssue) {
        console.log('⚠️ Native library issue detected, providing fallback response');
        return {
          action: 'capture',
          status: 'success',
          quality: 'fallback',
          deviceName: 'DigitalPersona Reader (Fallback)',
          timestamp: Date.now(),
          message: 'Fallback response due to native library issues',
          simulatedData: 'DP_FALLBACK_FINGERPRINT_DATA_' + Date.now(),
          note: 'This is a fallback response due to native library issues',
          isFallback: true
        };
      }
      
      throw error;
    }
  }

  async authenticateFingerprint(fingerprintData) {
    try {
      console.log('🔍 Authenticating fingerprint...');
      
      const response = await api.post('/auth/biometric-login', {
        fingerprintData: fingerprintData
      });
      
      if (response.data.success) {
        console.log('✅ Fingerprint authentication successful');
        return {
          success: true,
          user: response.data.user,
          token: response.data.token
        };
      } else {
        return {
          success: false,
          message: response.data.message || 'Authentication failed'
        };
      }
    } catch (error) {
      console.error('❌ Fingerprint authentication failed:', error);
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Authentication failed'
      };
    }
  }

  async getDevices() {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      
      // Call the backend to get fresh device enumeration
      const response = await api.get('/auth/digitalpersona-devices');
      
      if (response.data.success) {
        this.deviceList = response.data.devices || [];
        this.deviceConnected = this.deviceList.length > 0;
        return this.deviceList;
      } else {
        throw new Error(response.data.message || 'Failed to get devices');
      }
    } catch (error) {
      console.error('❌ Failed to get devices:', error);
      return [];
    }
  }

  isInitialized() {
    return this.initialized;
  }

  isDeviceConnected() {
    return this.deviceConnected;
  }

  isInFallbackMode() {
    return this.fallbackMode || false;
  }

  getDeviceInfo() {
    return {
      initialized: this.initialized,
      deviceConnected: this.deviceConnected,
      deviceCount: this.deviceList.length,
      devices: this.deviceList,
      fallbackMode: this.fallbackMode
    };
  }
}

export default DigitalPersonaNativeClient;
