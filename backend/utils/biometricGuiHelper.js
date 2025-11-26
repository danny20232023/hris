// biometricGuiHelper.js
// Wrapper for BiometricHelper.exe (uses DPFP.Gui SDK components)

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BiometricGuiHelper {
  constructor() {
    this.exePath = path.join(__dirname, 'BiometricHelper', 'bin', 'Release', 'net48', 'BiometricHelper.exe');
    console.log('🔥 BiometricGuiHelper initialized');
    console.log('📄 Executable:', this.exePath);
    console.log('✅ Using official DPFP.Gui SDK components');
  }

  /**
   * Enroll a fingerprint using DPFP.Gui.Enrollment.EnrollmentControl
   * @param {number} userId - User ID
   * @param {number} fingerId - Finger ID (0-9)
   * @param {string} userName - User name
   * @returns {Promise<Object>} Enrollment result with template
   */
  async enrollFingerprint(userId, fingerId, userName) {
    console.log(`🚀 Starting DPFP.Gui enrollment for User ${userId}, Finger ${fingerId}`);
    
    return new Promise((resolve, reject) => {
      const process = spawn(this.exePath, [
        'enroll',
        userId.toString(),
        fingerId.toString(),
        userName
      ]);

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        const message = data.toString();
        stderr += message;
        console.log('📋 BiometricHelper:', message.trim());
      });

      process.on('error', (error) => {
        console.error('❌ Failed to start BiometricHelper.exe:', error.message);
        reject(new Error(`Failed to start executable: ${error.message}`));
      });

      process.on('close', (code) => {
        console.log(`📊 BiometricHelper exited with code ${code}`);
        
        if (code === 0 && stdout.trim()) {
          try {
            const result = JSON.parse(stdout.trim());
            
            if (result.success) {
              console.log('✅ DPFP.Gui enrollment successful');
              console.log('   Template size:', result.templateSize);
              console.log('   Method:', result.method);
              resolve(result);
            } else {
              console.log('❌ DPFP.Gui enrollment failed:', result.message);
              reject(new Error(result.message || 'Enrollment failed'));
            }
          } catch (parseError) {
            console.error('❌ Failed to parse result:', stdout);
            reject(new Error(`Invalid JSON response: ${parseError.message}`));
          }
        } else {
          const errorMsg = stderr || 'Enrollment process failed';
          console.error('❌ Enrollment error:', errorMsg);
          reject(new Error(errorMsg));
        }
      });
    });
  }

  /**
   * Verify fingerprint using DPFP.Gui.Verification.VerificationControl
   * @param {Array} templates - Array of template data
   * @returns {Promise<Object>} Verification result
   */
  async verifyFingerprint(templates) {
    console.log(`🚀 Starting DPFP.Gui verification against ${templates.length} templates`);
    
    return new Promise((resolve, reject) => {
      const templatesJson = JSON.stringify(templates);
      
      const process = spawn(this.exePath, [
        'verify',
        templatesJson
      ]);

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        const message = data.toString();
        stderr += message;
        console.log('📋 BiometricHelper:', message.trim());
      });

      process.on('error', (error) => {
        console.error('❌ Failed to start BiometricHelper.exe:', error.message);
        reject(new Error(`Failed to start executable: ${error.message}`));
      });

      process.on('close', (code) => {
        console.log(`📊 BiometricHelper exited with code ${code}`);
        
        if (code === 0 && stdout.trim()) {
          try {
            const result = JSON.parse(stdout.trim());
            
            if (result.authenticated) {
              console.log('✅ DPFP.Gui verification successful');
              console.log('   Method:', result.method);
              resolve(result);
            } else {
              console.log('❌ Fingerprint not recognized');
              resolve(result); // Not an error, just no match
            }
          } catch (parseError) {
            console.error('❌ Failed to parse result:', stdout);
            reject(new Error(`Invalid JSON response: ${parseError.message}`));
          }
        } else {
          const errorMsg = stderr || 'Verification process failed';
          console.error('❌ Verification error:', errorMsg);
          reject(new Error(errorMsg));
        }
      });
    });
  }
}

export default BiometricGuiHelper;

