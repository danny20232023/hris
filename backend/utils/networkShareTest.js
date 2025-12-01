import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Test SMB/CIFS connection to network share
 * @param {string} server - Server IP or hostname
 * @param {string} share - Share name
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string} domain - Domain (optional)
 * @param {string} sharePath - Sub-path within share (optional)
 * @returns {Promise<{success: boolean, message: string, details?: any}>}
 */
export async function testSmbConnection(server, share, username, password, domain = '', sharePath = '') {
  const isWindows = process.platform === 'win32';
  
  try {
    if (isWindows) {
      return await testSmbConnectionWindows(server, share, username, password, domain, sharePath);
    } else {
      return await testSmbConnectionLinux(server, share, username, password, domain, sharePath);
    }
  } catch (error) {
    return {
      success: false,
      message: `Connection test failed: ${error.message}`,
      details: error
    };
  }
}

/**
 * Test SMB connection on Windows
 */
async function testSmbConnectionWindows(server, share, username, password, domain, sharePath) {
  try {
    // Construct UNC path
    const uncPath = `\\\\${server}\\${share}`;
    const fullPath = sharePath ? `${uncPath}\\${sharePath}` : uncPath;
    
    // Try to access the UNC path directly without mapping a drive
    // First, disconnect any existing connections to avoid error 1219
    try {
      await execAsync(`net use "${uncPath}" /delete /y`).catch(() => {
        // Ignore errors if connection doesn't exist
      });
    } catch {
      // Ignore errors
    }
    
    // Now authenticate using net use with the UNC path directly
    let authCommand = `net use "${uncPath}" /user:${username} "${password}"`;
    if (domain) {
      authCommand = `net use "${uncPath}" /user:${domain}\\${username} "${password}"`;
    }
    
    try {
      // Authenticate to the UNC path (this doesn't map a drive, just establishes credentials)
      const { stdout, stderr } = await execAsync(authCommand);
      
      // Check if authentication was successful
      if (stderr && !stderr.includes('successfully') && !stderr.includes('successfully connected')) {
        // Check for specific error codes
        if (stderr.includes('1326') || stderr.includes('access denied') || stderr.includes('The password is incorrect')) {
          return {
            success: false,
            message: 'Authentication failed. Please check username and password.',
            details: {
              error: 'AUTH_FAILED'
            }
          };
        } else if (stderr.includes('network path was not found') || stderr.includes('53') || stderr.includes('The network path was not found')) {
          return {
            success: false,
            message: 'Network path not found. Please check server IP and share name.',
            details: {
              error: 'PATH_NOT_FOUND'
            }
          };
        }
      }
      
      // Test direct access to the UNC path
      try {
        // Try to access the path directly
        await fs.access(fullPath);
        
        // Try to list directory
        const files = await fs.readdir(fullPath);
        
        // Disconnect the connection (cleanup)
        try {
          await execAsync(`net use "${uncPath}" /delete /y`);
        } catch {
          // Ignore cleanup errors
        }
        
        return {
          success: true,
          message: `Successfully connected to ${uncPath}`,
          details: {
            path: fullPath,
            accessible: true,
            fileCount: files.length
          }
        };
      } catch (accessError) {
        // Disconnect the connection (cleanup)
        try {
          await execAsync(`net use "${uncPath}" /delete /y`);
        } catch {
          // Ignore cleanup errors
        }
        
        // Check if it's a permission error
        if (accessError.code === 'EPERM' || accessError.code === 'EACCES') {
          return {
            success: false,
            message: 'Connected but access denied. Please check folder permissions.',
            details: {
              path: fullPath,
              accessible: false,
              error: 'ACCESS_DENIED'
            }
          };
        } else if (accessError.code === 'ENOENT') {
          return {
            success: false,
            message: `Connected but path does not exist: ${fullPath}`,
            details: {
              path: fullPath,
              accessible: false,
              error: 'PATH_NOT_FOUND'
            }
          };
        } else {
          return {
            success: false,
            message: `Connected but cannot access path: ${accessError.message}`,
            details: {
              path: fullPath,
              accessible: false,
              error: accessError.code
            }
          };
        }
      }
    } catch (authError) {
      // Check if it's an authentication error
      const errorMsg = authError.message || authError.stderr || '';
      
      if (errorMsg.includes('1326') || errorMsg.includes('access denied') || errorMsg.includes('The password is incorrect')) {
        return {
          success: false,
          message: 'Authentication failed. Please check username and password.',
          details: {
            error: 'AUTH_FAILED'
          }
        };
      } else if (errorMsg.includes('network path was not found') || errorMsg.includes('53') || errorMsg.includes('The network path was not found')) {
        return {
          success: false,
          message: 'Network path not found. Please check server IP and share name.',
          details: {
            error: 'PATH_NOT_FOUND'
          }
        };
      } else {
        return {
          success: false,
          message: `Failed to connect: ${errorMsg}`,
          details: {
            error: 'CONNECTION_FAILED',
            stderr: authError.stderr,
            stdout: authError.stdout
          }
        };
      }
    }
  } catch (error) {
    return {
      success: false,
      message: `Connection test error: ${error.message}`,
      details: error
    };
  }
}

/**
 * Test SMB connection on Linux/Docker
 */
async function testSmbConnectionLinux(server, share, username, password, domain, sharePath) {
  try {
    // Use smbclient to test connection
    const sharePathFull = `//${server}/${share}`;
    
    // Build smbclient command
    let command = `smbclient "${sharePathFull}" -U "${username}%${password}" -c "ls"`;
    if (domain) {
      command = `smbclient "${sharePathFull}" -U "${domain}/${username}%${password}" -c "ls"`;
    }
    
    try {
      const { stdout, stderr } = await execAsync(command, { timeout: 10000 });
      
      if (stderr && !stderr.includes('NT_STATUS')) {
        // Check if we got a directory listing
        if (stdout && stdout.length > 0) {
          return {
            success: true,
            message: `Successfully connected to ${sharePathFull}`,
            details: {
              path: sharePathFull,
              accessible: true
            }
          };
        }
      }
      
      // Check for specific error codes
      if (stderr.includes('NT_STATUS_LOGON_FAILURE') || stderr.includes('NT_STATUS_WRONG_PASSWORD')) {
        return {
          success: false,
          message: 'Authentication failed. Please check username and password.',
          details: {
            error: 'AUTH_FAILED'
          }
        };
      } else if (stderr.includes('NT_STATUS_BAD_NETWORK_NAME') || stderr.includes('NT_STATUS_OBJECT_NAME_NOT_FOUND')) {
        return {
          success: false,
          message: 'Network path not found. Please check server IP and share name.',
          details: {
            error: 'PATH_NOT_FOUND'
          }
        };
      } else if (stderr.includes('Connection refused') || stderr.includes('No route to host')) {
        return {
          success: false,
          message: 'Cannot reach server. Please check network connectivity and firewall settings.',
          details: {
            error: 'NETWORK_ERROR'
          }
        };
      }
      
      return {
        success: false,
        message: `Connection test failed: ${stderr || stdout}`,
        details: {
          error: 'UNKNOWN_ERROR',
          stderr,
          stdout
        }
      };
    } catch (execError) {
      // Parse error message
      const errorMsg = execError.stderr || execError.message || '';
      
      if (errorMsg.includes('NT_STATUS_LOGON_FAILURE') || errorMsg.includes('NT_STATUS_WRONG_PASSWORD')) {
        return {
          success: false,
          message: 'Authentication failed. Please check username and password.',
          details: {
            error: 'AUTH_FAILED'
          }
        };
      } else if (errorMsg.includes('NT_STATUS_BAD_NETWORK_NAME') || errorMsg.includes('NT_STATUS_OBJECT_NAME_NOT_FOUND')) {
        return {
          success: false,
          message: 'Network path not found. Please check server IP and share name.',
          details: {
            error: 'PATH_NOT_FOUND'
          }
        };
      } else if (errorMsg.includes('Connection refused') || errorMsg.includes('No route to host')) {
        return {
          success: false,
          message: 'Cannot reach server. Please check network connectivity and firewall settings.',
          details: {
            error: 'NETWORK_ERROR'
          }
        };
      }
      
      return {
        success: false,
        message: `Connection test failed: ${errorMsg}`,
        details: {
          error: 'EXEC_ERROR',
          stderr: execError.stderr,
          stdout: execError.stdout
        }
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Connection test error: ${error.message}`,
      details: error
    };
  }
}

