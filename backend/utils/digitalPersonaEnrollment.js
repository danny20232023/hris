import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * DigitalPersona Enrollment Wrapper
 * Calls PowerShell script to enroll fingerprints using DigitalPersona SDK
 */
class DigitalPersonaEnrollment {
  constructor() {
    // Use EnrollFingerprintSimple.ps1 with hardware finger detection requirement
    this.enrollmentScript = path.join(__dirname, 'EnrollFingerprintSimple.ps1');
    
    if (!fs.existsSync(this.enrollmentScript)) {
      throw new Error(`Enrollment script not found: ${this.enrollmentScript}`);
    }
    
    console.log('📋 DigitalPersona Enrollment wrapper initialized');
    console.log('📄 Script path:', this.enrollmentScript);
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('⚠️  SECURITY NOTICE: SUPERVISED ENROLLMENT REQUIRED');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('   ▶ Enrollment staff MUST supervise the entire process');
    console.log('   ▶ Verify employee places finger on scanner for EACH sample');
    console.log('   ▶ Watch backend console for enrollment progress');
    console.log('   ▶ Do NOT leave enrollment process unattended');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
  }

  /**
   * Enroll a fingerprint for a user
   * @param {number} userId - User ID
   * @param {number} fingerId - Finger ID (0-9)
   * @param {string} name - User's full name
   * @param {number} requiredSamples - Number of samples required (default: 3)
   * @param {number} timeoutSeconds - Timeout in seconds (default: 30)
   * @returns {Promise<object>} Enrollment result with templateBase64
   */
  async enrollFingerprint(userId, fingerId, name, requiredSamples = 3, timeoutSeconds = 30) {
    try {
      console.log(`🚀 Starting enrollment for User ${userId}, Finger ${fingerId}`);
      
      // Build PowerShell command
      const psCommand = [
        'powershell.exe',
        '-ExecutionPolicy', 'Bypass',
        '-NoProfile',
        '-File', `"${this.enrollmentScript}"`,
        '-UserID', String(userId),
        '-FingerID', String(fingerId),  // Convert to string to handle 0
        '-Name', `"${name}"`,
        '-RequiredSamples', String(requiredSamples),
        '-TimeoutSeconds', String(timeoutSeconds)
      ].filter(part => part !== '').join(' ');
      
      console.log('📝 Executing PowerShell command...');
      console.log('   Command:', psCommand.substring(0, 150) + '...');
      
      // Execute PowerShell script with extended timeout
      const { stdout, stderr } = await execAsync(psCommand, {
        timeout: (timeoutSeconds + 10) * 1000, // Add 10 seconds buffer
        maxBuffer: 1024 * 1024, // 1MB buffer
        encoding: 'utf8'
      });
      
      // Parse stderr for progress markers
      let currentAttempt = 0;
      let attemptStatuses = [];
      
      if (stderr) {
        const stderrLines = stderr.split('\n').filter(line => line.trim());
        stderrLines.forEach(line => {
          // Parse progress markers (format: ATTEMPT_1_START: or [ATTEMPT_1_START])
          if (line.includes('ATTEMPT_') && line.includes('_START')) {
            const match = line.match(/ATTEMPT_(\d+)_START/);
            if (match) {
              currentAttempt = parseInt(match[1]);
              console.log(`📸 Attempt ${currentAttempt}/3 starting...`);
            }
          } else if (line.includes('ATTEMPT_') && line.includes('_COMPLETE')) {
            const match = line.match(/ATTEMPT_(\d+)_COMPLETE.*Quality:\s*(\d+)/);
            if (match) {
              const attempt = parseInt(match[1]);
              const quality = parseInt(match[2]);
              attemptStatuses.push({ attempt, quality, status: 'complete' });
              console.log(`✅ Attempt ${attempt}/3 completed - Quality: ${quality}%`);
            }
          } else if (line.includes('[ERROR]') || line.includes('ERROR:')) {
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
      
      if (result.success) {
        console.log('✅ Enrollment completed successfully');
        console.log('   FUID:', result.fuid);
        console.log('   Samples:', result.samplesCollected);
        console.log('   Avg Quality:', result.avgQuality?.toFixed(2) || 'N/A');
        console.log('   Template Size:', result.templateSize, 'bytes');
      } else {
        console.error('❌ Enrollment failed:', result.message);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Enrollment error:', error.message);
      
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
      
      return {
        success: false,
        message: `Enrollment failed: ${error.message}`,
        error: error.message,
        userId: userId,
        fingerId: fingerId,
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
        console.warn('⚠️ Looked in: C:\\Program Files\\DigitalPersona\\One Touch SDK\\.NET\\Bin');
        return false;
      }
      
      console.log('✅ DigitalPersona SDK directory found');
      
      // Check for required DLLs
      const requiredDlls = ['DPFPDevNET.dll', 'DPFPEngNET.dll', 'DPFPShrNET.dll'];
      const foundDlls = [];
      const missingDlls = [];
      
      for (const dll of requiredDlls) {
        const dllPath = path.join(sdkPath, dll);
        if (fs.existsSync(dllPath)) {
          foundDlls.push(dll);
          console.log(`✅ Found: ${dll}`);
        } else {
          missingDlls.push(dll);
          console.warn(`⚠️ Required DLL not found: ${dll}`);
        }
      }
      
      if (missingDlls.length > 0) {
        console.warn(`⚠️ Missing ${missingDlls.length} required DLLs:`, missingDlls);
        return false;
      }
      
      console.log('✅ DigitalPersona SDK is available and all required DLLs found');
      return true;
      
    } catch (error) {
      console.error('❌ SDK verification error:', error.message);
      return false;
    }
  }
}

export default DigitalPersonaEnrollment;
