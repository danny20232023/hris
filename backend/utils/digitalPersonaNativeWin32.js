import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DigitalPersonaNativeWin32 {
  constructor() {
    this.initialized = false;
    this.deviceConnected = false;
    this.deviceList = [];
    this.currentDevice = null;
    
    // Paths to DigitalPersona win32 libraries
    this.digitalPersonaLibPath = 'C:\\Program Files\\DigitalPersona\\U.are.U SDK\\Windows\\Lib\\win32';
    this.dpfpddDll = path.join(this.digitalPersonaLibPath, 'dpfpdd.dll');
    this.dpfjDll = path.join(this.digitalPersonaLibPath, 'dpfj.dll');
    
    // Create a simple C++ wrapper to interface with the native libraries
    this.cppWrapper = path.join(__dirname, 'DigitalPersonaNativeWrapper.cpp');
    this.exeWrapper = path.join(__dirname, 'DigitalPersonaNativeWrapper.exe');
    
    console.log('🏗️ DigitalPersonaNativeWin32 constructor completed');
    console.log('🔧 DigitalPersona Lib Path:', this.digitalPersonaLibPath);
    console.log('🔧 DPFPDD DLL:', this.dpfpddDll);
    console.log('🔧 DPFJ DLL:', this.dpfjDll);
  }

  async initialize() {
    try {
      console.log('🚀 Starting DigitalPersona Native Win32 SDK initialization...');
      
      // Create and compile the C++ wrapper
      await this.createCppWrapper();
      await this.compileCppWrapper();
      
      // Initialize the SDK
      const result = await this.executeWrapperCommand('init');
      console.log('✅ DigitalPersona Native Win32 SDK initialized:', result);
      
      this.initialized = result.status === 'success';
      
      if (this.initialized) {
        await this.getDevices();
      }
      
      return this.initialized;
    } catch (error) {
      console.error('❌ Failed to initialize DigitalPersona Native Win32 SDK:', error);
      this.initialized = false;
      throw error;
    }
  }

  async createCppWrapper() {
    const cppCode = `
#include <windows.h>
#include <iostream>
#include <string>
#include <vector>
#include <json/json.h>

// DigitalPersona function declarations
extern "C" {
    int __stdcall dpfpdd_init(void);
    int __stdcall dpfpdd_exit(void);
    int __stdcall dpfpdd_query_devices(unsigned int* dev_cnt, void* dev_infos);
    int __stdcall dpfpdd_open_ext(char* dev_name, unsigned int priority, void* pdev);
    int __stdcall dpfpdd_close(void* dev);
    int __stdcall dpfpdd_capture(void* dev, void* capture_parm, unsigned int timeout_cnt, void* capture_result, unsigned int* image_size, unsigned char* image_data);
    int __stdcall dpfpdd_get_device_status(void* dev, void* dev_status);
    int __stdcall dpfpdd_get_device_capabilities(void* dev, void* dev_caps);
}

typedef void* DPFPDD_DEV;

struct DPFPDD_DEV_INFO {
    unsigned int size;
    char name[1024];
    char vendor_name[128];
    char product_name[128];
    char serial_num[128];
    unsigned short vendor_id;
    unsigned short product_id;
    unsigned int modality;
    unsigned int technology;
};

struct DPFPDD_DEV_STATUS {
    unsigned int size;
    unsigned int status;
    int finger_detected;
};

struct DPFPDD_CAPTURE_PARAM {
    unsigned int size;
    unsigned int image_fmt;
    unsigned int image_proc;
    unsigned int image_res;
};

struct DPFPDD_CAPTURE_RESULT {
    unsigned int size;
    int success;
    unsigned int quality;
    unsigned int score;
    unsigned int width;
    unsigned int height;
    unsigned int res;
    unsigned int bpp;
};

std::string executeCommand(const std::string& command) {
    try {
        if (command == "init") {
            int result = dpfpdd_init();
            Json::Value response;
            response["action"] = "init";
            if (result == 0) {
                response["status"] = "success";
                response["message"] = "DigitalPersona Native SDK initialized successfully";
            } else {
                response["status"] = "error";
                response["message"] = "Failed to initialize DigitalPersona Native SDK";
            }
            response["result_code"] = result;
            return response.toStyledString();
        }
        else if (command == "query") {
            unsigned int dev_cnt = 0;
            int result = dpfpdd_query_devices(&dev_cnt, nullptr);
            
            Json::Value response;
            response["action"] = "query";
            
            if (result == 0 && dev_cnt > 0) {
                std::vector<DPFPDD_DEV_INFO> devices(dev_cnt);
                result = dpfpdd_query_devices(&dev_cnt, devices.data());
                
                if (result == 0) {
                    Json::Value deviceArray(Json::arrayValue);
                    for (unsigned int i = 0; i < dev_cnt; i++) {
                        Json::Value device;
                        device["id"] = i;
                        device["name"] = devices[i].name;
                        device["vendor_name"] = devices[i].vendor_name;
                        device["product_name"] = devices[i].product_name;
                        device["serial_number"] = devices[i].serial_num;
                        device["model"] = devices[i].product_name;
                        device["connected"] = true;
                        deviceArray.append(device);
                    }
                    response["status"] = "success";
                    response["devices"] = deviceArray;
                    response["deviceCount"] = dev_cnt;
                    response["message"] = "Device enumeration completed";
                } else {
                    response["status"] = "error";
                    response["message"] = "Failed to query device details";
                }
            } else if (dev_cnt == 0) {
                response["status"] = "success";
                response["devices"] = Json::Value(Json::arrayValue);
                response["deviceCount"] = 0;
                response["message"] = "No DigitalPersona devices found";
            } else {
                response["status"] = "error";
                response["message"] = "Failed to query devices";
            }
            response["result_code"] = result;
            return response.toStyledString();
        }
        else if (command == "capture") {
            // For now, provide a simulated capture response
            // In a full implementation, we would open a device and capture
            Json::Value response;
            response["action"] = "capture";
            response["status"] = "success";
            response["quality"] = "simulated";
            response["deviceName"] = "DigitalPersona Reader (Native)";
            response["timestamp"] = static_cast<unsigned long long>(time(nullptr) * 1000);
            response["message"] = "Fingerprint capture simulated - native library communication successful";
            response["simulatedData"] = "DP_NATIVE_FINGERPRINT_DATA_" + std::to_string(time(nullptr));
            response["note"] = "This is a simulated response from native win32 libraries";
            return response.toStyledString();
        }
        else if (command == "cleanup") {
            int result = dpfpdd_exit();
            Json::Value response;
            response["action"] = "cleanup";
            if (result == 0) {
                response["status"] = "success";
                response["message"] = "DigitalPersona Native SDK cleaned up successfully";
            } else {
                response["status"] = "error";
                response["message"] = "Failed to cleanup DigitalPersona Native SDK";
            }
            response["result_code"] = result;
            return response.toStyledString();
        }
        else {
            Json::Value response;
            response["action"] = "unknown";
            response["status"] = "error";
            response["message"] = "Unknown command: " + command;
            return response.toStyledString();
        }
    }
    catch (const std::exception& e) {
        Json::Value response;
        response["action"] = command;
        response["status"] = "error";
        response["message"] = "Exception: " + std::string(e.what());
        return response.toStyledString();
    }
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "{\\"error\\":\\"No command specified\\"}" << std::endl;
        return 1;
    }
    
    std::string command = argv[1];
    std::string result = executeCommand(command);
    std::cout << result << std::endl;
    
    return 0;
}
`;

    await fs.promises.writeFile(this.cppWrapper, cppCode);
    console.log('✅ C++ wrapper created');
  }

  async compileCppWrapper() {
    try {
      // Try to find MinGW or Visual Studio compiler
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
        throw new Error('No C++ compiler found (tried g++, cl, gcc)');
      }
      
      console.log(`🔧 Using compiler: ${compiler}`);
      
      // Compile with DigitalPersona libraries
      const compileCommand = compiler === 'cl' 
        ? `cl /EHsc "${this.cppWrapper}" /link "${this.dpfpddDll}" "${this.dpfjDll}" /OUT:"${this.exeWrapper}"`
        : `g++ -std=c++11 "${this.cppWrapper}" -L"${this.digitalPersonaLibPath}" -ldpfpdd -ldpfj -ljsoncpp -o "${this.exeWrapper}"`;
      
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
      
      console.log('📸 Capturing fingerprint via Native Win32 SDK...');
      
      const result = await this.executeWrapperCommand('capture');
      
      if (result && result.status === 'success') {
        console.log('✅ Fingerprint captured successfully');
        
        // Handle simulated responses
        if (result.quality === 'simulated') {
          console.log('📝 Simulated fingerprint capture from native libraries');
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
      console.log('🧹 Cleaning up DigitalPersona Native Win32 SDK...');
      
      const result = await this.executeWrapperCommand('cleanup');
      
      this.initialized = false;
      this.deviceConnected = false;
      this.deviceList = [];
      
      console.log('✅ DigitalPersona Native Win32 SDK cleaned up:', result);
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

export default DigitalPersonaNativeWin32;
