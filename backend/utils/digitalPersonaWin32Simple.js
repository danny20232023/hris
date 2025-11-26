import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DigitalPersonaWin32Simple {
  constructor() {
    this.initialized = false;
    this.deviceConnected = false;
    this.deviceList = [];
    this.currentDevice = null;
    
    // Paths to DigitalPersona win32 libraries and wrapper
    this.digitalPersonaLibPath = 'C:\\Program Files\\DigitalPersona\\U.are.U SDK\\Windows\\Lib\\win32';
    this.dpfpddDll = path.join(this.digitalPersonaLibPath, 'dpfpdd.dll');
    this.dpfjDll = path.join(this.digitalPersonaLibPath, 'dpfj.dll');
    
    this.cppWrapper = path.join(__dirname, 'DigitalPersonaWin32Wrapper.cpp');
    this.exeWrapper = path.join(__dirname, 'DigitalPersonaWin32Wrapper.exe');
    
    console.log('🏗️ DigitalPersonaWin32Simple constructor completed');
    console.log('🔧 DigitalPersona Lib Path:', this.digitalPersonaLibPath);
    console.log('🔧 DPFPDD DLL:', this.dpfpddDll);
    console.log('🔧 DPFJ DLL:', this.dpfjDll);
    console.log('🔧 C++ Wrapper:', this.cppWrapper);
    console.log('🔧 Executable Wrapper:', this.exeWrapper);
  }

  async initialize() {
    try {
      console.log('🚀 Starting DigitalPersona Win32 SDK initialization...');
      
      // Check if libraries exist
      if (!fs.existsSync(this.dpfpddDll)) {
        throw new Error(`DigitalPersona library not found: ${this.dpfpddDll}`);
      }
      
      if (!fs.existsSync(this.dpfjDll)) {
        throw new Error(`DigitalPersona library not found: ${this.dpfjDll}`);
      }
      
      // Check if executable exists, if not compile it
      if (!fs.existsSync(this.exeWrapper)) {
        console.log('🔧 Compiling C++ wrapper...');
        await this.compileCppWrapper();
      }
      
      // Initialize the SDK
      const result = await this.executeWrapperCommand('init');
      console.log('✅ DigitalPersona Win32 SDK initialized:', result);
      
      this.initialized = result.status === 'success';
      
      if (this.initialized) {
        await this.getDevices();
      }
      
      return this.initialized;
    } catch (error) {
      console.error('❌ Failed to initialize DigitalPersona Win32 SDK:', error);
      this.initialized = false;
      throw error;
    }
  }

  async compileCppWrapper() {
    try {
      // Try to find a C++ compiler
      const possibleCompilers = [
        'g++',
        'cl',  // Visual Studio
        'gcc'
      ];
      
      let compiler = null;
      for (const comp of possibleCompilers) {
        try {
          await execAsync(`${comp} --version`, { timeout: 5000 });
          compiler = comp;
          break;
        } catch (e) {
          // Try next compiler
        }
      }
      
      if (!compiler) {
        throw new Error('No C++ compiler found (tried g++, cl, gcc). Please install MinGW or Visual Studio Build Tools.');
      }
      
      console.log(`🔧 Using compiler: ${compiler}`);
      
      // Compile with DigitalPersona libraries
      let compileCommand;
      if (compiler === 'cl') {
        // Visual Studio compiler
        compileCommand = `cl /EHsc "${this.cppWrapper}" /link "${this.dpfpddDll}" "${this.dpfjDll}" /OUT:"${this.exeWrapper}"`;
      } else {
        // MinGW compiler
        compileCommand = `g++ -std=c++11 "${this.cppWrapper}" -L"${this.digitalPersonaLibPath}" -ldpfpdd -ldpfj -o "${this.exeWrapper}"`;
      }
      
      console.log('🔧 Compile command:', compileCommand);
      
      await execAsync(compileCommand, {
        timeout: 30000,
        cwd: __dirname
      });
      
      console.log('✅ C++ wrapper compiled successfully');
    } catch (error) {
      console.error('❌ Failed to compile C++ wrapper:', error);
      throw error;
    }
  }

  async executeWrapperCommand(command) {
    try {
      const commandLine = `"${this.exeWrapper}" ${command}`;
      console.log(`🔧 Executing command: ${commandLine}`);
      
      const { stdout, stderr } = await execAsync(commandLine, {
        timeout: 10000,
        cwd: __dirname
      });
      
      if (stderr) {
        console.error('Wrapper stderr:', stderr);
      }
      
      // Parse JSON output
      try {
        return JSON.parse(stdout.trim());
      } catch (parseError) {
        console.error('Failed to parse wrapper output:', stdout);
        throw new Error('Invalid JSON response from native wrapper');
      }
    } catch (error) {
      console.error('❌ Native wrapper execution failed:', error);
      throw error;
    }
  }

  async getDevices() {
    try {
      const result = await this.executeWrapperCommand('query');
      
      this.deviceList = result.devices || [];
      this.deviceConnected = this.deviceList.length > 0;
      
      return this.deviceList;
    } catch (error) {
      console.error('❌ Failed to get devices:', error);
      this.deviceList = [];
      this.deviceConnected = false;
      return [];
    }
  }

  async enumerateDevices() {
    return await this.getDevices();
  }

  async captureFingerprint(timeout = 30000) {
    try {
      if (!this.initialized) {
        throw new Error('DigitalPersona not initialized');
      }
      
      console.log('📸 Capturing fingerprint via Win32 SDK...');
      
      const result = await this.executeWrapperCommand('capture');
      
      if (result && result.status === 'success') {
        console.log('✅ Fingerprint captured successfully');
        
        // Handle simulated responses
        if (result.quality === 'simulated') {
          console.log('📝 Simulated fingerprint capture from win32 native libraries');
          result.isSimulated = true;
        }
        
        return result;
      } else {
        throw new Error(result?.message || 'Fingerprint capture failed');
      }
    } catch (error) {
      console.error('❌ Fingerprint capture failed:', error);
      throw error;
    }
  }

  async cleanup() {
    try {
      console.log('🧹 Cleaning up DigitalPersona Win32 SDK...');
      
      const result = await this.executeWrapperCommand('cleanup');
      
      this.initialized = false;
      this.deviceConnected = false;
      this.deviceList = [];
      
      console.log('✅ DigitalPersona Win32 SDK cleaned up:', result);
    } catch (error) {
      console.error('❌ Cleanup error:', error);
    }
  }

  isInitialized() {
    return this.initialized;
  }

  isDeviceConnected() {
    return this.deviceConnected;
  }

  getDeviceInfo() {
    return {
      Initialized: this.initialized,
      ReaderCount: this.deviceList.length,
      Devices: this.deviceList
    };
  }
}

export default DigitalPersonaWin32Simple;
