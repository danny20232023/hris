import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * DigitalPersona Verification Wrapper
 * Calls PowerShell script to verify fingerprints using DigitalPersona SDK
 */
class DigitalPersonaVerification {
  constructor() {
    this.verificationScript = path.join(__dirname, 'VerifyFingerprint.ps1');
    
    if (!fs.existsSync(this.verificationScript)) {
      throw new Error(`Verification script not found: ${this.verificationScript}`);
    }
    
    console.log('📋 DigitalPersona Verification wrapper initialized');
    console.log('📄 Script path:', this.verificationScript);
  }

  /**
   * Verify fingerprint against all stored templates
   * @param {string} server - SQL Server name
   * @param {string} database - Database name
   * @param {string} username - SQL Server username (optional, uses Windows auth if not provided)
   * @param {string} password - SQL Server password (optional)
   * @param {number} timeoutSeconds - Timeout in seconds (default: 30)
   * @returns {Promise<object>} Verification result with matched user info
   */
  async verifyFingerprint(server, database, username = '', password = '', timeoutSeconds = 30) {
    try {
      console.log(`🚀 Starting fingerprint verification (biometric login)`);
      
      // Build PowerShell command
      const psCommand = [
        'powershell.exe',
        '-ExecutionPolicy', 'Bypass',
        '-NoProfile',
        '-File', `"${this.verificationScript}"`,
        '-Server', `"${server}"`,
        '-Database', `"${database}"`,
        username ? `-Username "${username}"` : '',
        password ? `-Password "${password}"` : '',
        '-TimeoutSeconds', timeoutSeconds
      ].filter(part => part).join(' ');
      
      console.log('📝 Executing PowerShell verification command...');
      console.log('   PowerShell will wait 8 seconds for finger placement...');
      
      // Execute PowerShell script with extended timeout
      const { stdout, stderr } = await execAsync(psCommand, {
        timeout: (timeoutSeconds + 15) * 1000, // Add 15 seconds buffer for finger placement
        maxBuffer: 1024 * 1024, // 1MB buffer
        encoding: 'utf8'
      });
      
      // Log stderr (contains Write-Log output)
      if (stderr) {
        const stderrLines = stderr.split('\n').filter(line => line.trim());
        stderrLines.forEach(line => {
          if (line.includes('[ERROR]')) {
            console.error('PowerShell:', line);
          } else if (line.includes('[WARN]')) {
            console.warn('PowerShell:', line);
          } else {
            console.log('PowerShell:', line);
          }
        });
      }
      
      // Parse JSON output from stdout
      let cleanOutput = stdout.trim();
      
      // Remove BOM if present
      if (cleanOutput.startsWith('\ufeff')) {
        cleanOutput = cleanOutput.substring(1);
      }
      
      // Find JSON output (should be the last line or a complete JSON object)
      const jsonStart = cleanOutput.lastIndexOf('{');
      if (jsonStart >= 0) {
        cleanOutput = cleanOutput.substring(jsonStart);
      }
      
      // Parse result
      const result = JSON.parse(cleanOutput);
      
      if (result.success && result.authenticated) {
        console.log('✅ Fingerprint verification successful');
        console.log('   User ID:', result.userId);
        console.log('   Finger ID:', result.fingerId);
        console.log('   Name:', result.name);
        console.log('   FUID:', result.fuid);
      } else {
        console.log('❌ Fingerprint verification failed:', result.message);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Verification error:', error.message);
      
      // Try to parse error output
      if (error.stdout) {
        try {
          const jsonStart = error.stdout.lastIndexOf('{');
          if (jsonStart >= 0) {
            const errorResult = JSON.parse(error.stdout.substring(jsonStart));
            return errorResult;
          }
        } catch (parseError) {
          // Couldn't parse, return generic error
        }
      }
      
      // Check for specific error types
      let message = `Verification failed: ${error.message}`;
      
      if (error.message.includes('timeout') || error.killed) {
        message = 'No finger detected - Timeout. Please place finger on scanner and press SPACE.';
      } else if (error.message.includes('No finger detected')) {
        message = 'No finger detected on scanner. Please try again.';
      } else if (error.message.includes('No fingerprint templates found')) {
        message = 'No fingerprint templates found in database. Please enroll fingerprints first.';
      }
      
      return {
        success: false,
        authenticated: false,
        message: message,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Verify if the DigitalPersona SDK is available
   * @returns {Promise<boolean>}
   */
  async verifySdkAvailable() {
    try {
      const sdkPath = 'C:\\Program Files\\DigitalPersona\\One Touch SDK\\.NET\\Bin';
      
      // Check if SDK directory exists
      if (!fs.existsSync(sdkPath)) {
        console.warn('⚠️ DigitalPersona SDK not found at:', sdkPath);
        return false;
      }
      
      // Check for required DLLs
      const requiredDlls = ['DPFPDevNET.dll', 'DPFPEngNET.dll', 'DPFPShrNET.dll', 'DPFPVerNET.dll'];
      for (const dll of requiredDlls) {
        const dllPath = path.join(sdkPath, dll);
        if (!fs.existsSync(dllPath)) {
          console.warn(`⚠️ Required DLL not found: ${dll}`);
          return false;
        }
      }
      
      console.log('✅ DigitalPersona SDK is available for verification');
      return true;
      
    } catch (error) {
      console.error('❌ SDK verification error:', error.message);
      return false;
    }
  }
}

export default DigitalPersonaVerification;
