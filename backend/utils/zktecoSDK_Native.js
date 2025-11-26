// backend/utils/zktecoSDK_Native.js
import edge from 'edge-js';

let createZKWrapper = null;
let initError = null;

// Try to create the wrapper with error handling
try {
  console.log('Initializing edge-js wrapper for ZKTeco SDK...');
  
  createZKWrapper = edge.func({
    source: `
      using System;
      using System.Threading.Tasks;
      
      public class Startup
      {
          public async Task<object> Invoke(dynamic input)
          {
              string action = input.action;
              string ip = input.ip;
              int port = input.port;
              
              try
              {
                  // Create instance of ZKTeco SDK using ProgID
                  Type type = Type.GetTypeFromProgID("zkemkeeper.ZKEM");
                  if (type == null)
                  {
                      return new { 
                          success = false, 
                          error = "ZKTeco SDK not registered. Run Register_SDK x64.bat as Administrator." 
                      };
                  }
                  
                  dynamic sdk = Activator.CreateInstance(type);
                  
                  if (action == "connect")
                  {
                      bool connected = sdk.Connect_Net(ip, port);
                      if (!connected)
                      {
                          int errorCode = 0;
                          sdk.GetLastError(ref errorCode);
                          return new { success = false, error = "Connection failed. Error code: " + errorCode.ToString() };
                      }
                      sdk.Disconnect();
                      return new { success = true, message = "Connection test successful" };
                  }
                  else if (action == "setUserInfo")
                  {
                      bool connected = sdk.Connect_Net(ip, port);
                      if (!connected)
                      {
                          int errorCode = 0;
                          sdk.GetLastError(ref errorCode);
                          return new { success = false, error = "Connection failed. Error code: " + errorCode.ToString() };
                      }
                      
                      string enrollNumber = input.enrollNumber;
                      string name = input.name;
                      string password = input.password ?? enrollNumber;
                      int privilege = input.privilege ?? 0;
                      bool enabled = input.enabled ?? true;
                      int machineNumber = input.machineNumber ?? 1;
                      
                      sdk.EnableDevice(machineNumber, false);
                      
                      bool result = sdk.SSR_SetUserInfo(machineNumber, enrollNumber, name, 
                                                        password, privilege, enabled);
                      
                      sdk.EnableDevice(machineNumber, true);
                      sdk.Disconnect();
                      
                      if (result)
                      {
                          return new { 
                              success = true, 
                              message = "User " + enrollNumber + " (" + name + ") uploaded successfully",
                              enrollNumber = enrollNumber,
                              name = name
                          };
                      }
                      else
                      {
                          int errorCode = 0;
                          sdk.GetLastError(ref errorCode);
                          return new { 
                              success = false, 
                              error = "Failed to set user info. Error code: " + errorCode.ToString(),
                              errorCode = errorCode
                          };
                      }
                  }
                  else if (action == "disconnect")
                  {
                      sdk.Disconnect();
                      return new { success = true };
                  }
                  
                  return new { success = false, error = "Unknown action: " + action };
              }
              catch (Exception ex)
              {
                  return new { 
                      success = false, 
                      error = ex.Message, 
                      stackTrace = ex.StackTrace,
                      type = ex.GetType().Name
                  };
              }
          }
      }
    `
  });
  
  console.log('✅ edge-js wrapper initialized successfully');
  
} catch (error) {
  console.error('❌ Failed to initialize edge-js wrapper:', error);
  console.error('Error details:', error.message);
  console.error('Error stack:', error.stack);
  initError = error;
}
/**
 * ZKTeco Native SDK Wrapper using official zkemkeeper.dll
 * Supports SetUserInfo/SSR_SetUserInfo functions
 */
export class ZKTecoNativeSDK {
  constructor(ip, port = 4370) {
    this.ip = ip;
    this.port = port;
  }

  /**
   * Test connection to the device
   */
  async testConnection() {
    try {
      console.log(`Testing connection to ${this.ip}:${this.port} using native SDK...`);
      const result = await createZKWrapper({
        action: 'connect',
        ip: this.ip,
        port: this.port
      });
      
      if (result.success) {
        console.log(`✅ ${result.message}`);
        return true;
      } else {
        console.error(`❌ Connection test failed: ${result.error}`);
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('❌ SDK connection test error:', error);
      throw error;
    }
  }

  /**
   * Upload/Update user information to the device
   * @param {string|number} enrollNumber - Badge number (PIN on device)
   * @param {string} name - Employee name
   * @param {string|number} password - Password/PIN (defaults to enrollNumber)
   * @param {number} privilege - 0=User, 1=Enroller, 2=Admin, 3=Super Admin
   * @param {boolean} enabled - true=enabled, false=disabled
   * @param {number} machineNumber - Machine number (usually 1)
   */
  async setUserInfo(enrollNumber, name, password = null, privilege = 0, enabled = true, machineNumber = 1) {
    try {
      console.log(`Uploading user: ${enrollNumber} - ${name} to ${this.ip}:${this.port}`);
      
      const result = await createZKWrapper({
        action: 'setUserInfo',
        ip: this.ip,
        port: this.port,
        enrollNumber: enrollNumber.toString(),
        name: name,
        password: password ? password.toString() : enrollNumber.toString(),
        privilege: privilege,
        enabled: enabled,
        machineNumber: machineNumber
      });
      
            
      console.log('SDK result:', result);
      
      if (!result) {
        throw new Error('No response from SDK. The DLL might not be registered. Run "Register_SDK x64.bat" as Administrator.');
      }
      
      if (result.success) {
        console.log(`✅ ${result.message}`);
        return {
          success: true,
          message: result.message,
          enrollNumber: result.enrollNumber,
          name: result.name
        };
      } else {
        const errorMsg = result.error || 'Unknown error';
        console.error(`❌ Failed to upload user ${enrollNumber}: ${errorMsg}`);
        if (result.stackTrace) {
          console.error('Stack trace:', result.stackTrace);
        }
        throw new Error(errorMsg);
      }
      if (result.success) {
        console.log(`✅ ${result.message}`);
        return {
          success: true,
          message: result.message,
          enrollNumber: result.enrollNumber,
          name: result.name
        };
      } else {
        console.error(`❌ Failed to upload user ${enrollNumber}: ${result.error}`);
        throw new Error(result.error);
      }
    } catch (error) {
      console.error(`❌ Error uploading user ${enrollNumber}:`, error.message);
      throw error;
    }
  }

  /**
   * Batch upload multiple users
   * @param {Array} users - Array of user objects with {enrollNumber, name, password, privilege, enabled}
   */
  async batchSetUsers(users) {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const user of users) {
      try {
        await this.setUserInfo(
          user.enrollNumber || user.BADGENUMBER,
          user.name || user.NAME,
          user.password || user.BADGENUMBER,
          user.privilege ?? 0,
          user.enabled ?? true
        );
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          enrollNumber: user.enrollNumber || user.BADGENUMBER,
          name: user.name || user.NAME,
          error: error.message
        });
      }
    }

    return results;
  }
}

export default ZKTecoNativeSDK;