import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import { getMediaDirectory, getMediaExtension, generateMediaRelativePath, getMimeType, getMediaPathId } from '../config/uploadsConfig.js';
import { getHR201Pool } from '../config/hr201Database.js';

const execAsync = promisify(exec);

// Credential cache for network shares
const credentialCache = new Map(); // Key: uncPath, Value: { driveLetter, lastVerified, username, password, domain }

/**
 * Check if running in Docker container
 * @returns {boolean}
 */
function isRunningInDocker() {
  // Check for Docker environment file (most reliable method)
  try {
    if (fsSync.existsSync('/.dockerenv')) {
      return true;
    }
  } catch {
    // File system check failed, continue with other methods
  }
  
  // Check environment variable
  if (process.env.DOCKER_CONTAINER === 'true' || process.env.DOCKER_CONTAINER === '1') {
    return true;
  }
  
  // Check if process.cwd() is a Linux absolute path (starts with /) 
  // and we're not on Windows platform
  const cwd = process.cwd();
  if (process.platform !== 'win32' && cwd.startsWith('/')) {
    // Likely in Docker/Linux environment
    return true;
  }
  
  // If we're on Windows but cwd starts with /, we're likely in WSL or Docker
  if (process.platform === 'win32' && cwd.startsWith('/')) {
    return true;
  }
  
  return false;
}

/**
 * Convert Windows absolute path to Docker container path
 * Handles paths like C:\HRIS\backend\uploads\photo\filename.jpg
 * and converts them to /app/uploads/photo/filename.jpg
 * @param {string} filePath - Windows absolute path
 * @returns {string|null} - Docker container path or null if cannot convert
 */
function convertWindowsPathToDockerPath(filePath) {
  if (!filePath) return null;
  
  // Check if it's a Windows absolute path (starts with drive letter like C:\)
  const isWindowsPath = /^[A-Za-z]:\\/.test(filePath);
  if (!isWindowsPath) return null;
  
  // Extract path after drive letter and normalize to forward slashes
  const pathAfterDrive = filePath.replace(/^[A-Za-z]:\\/, '').replace(/\\/g, '/');
  
  // Find "uploads" directory in the path
  const uploadsIndex = pathAfterDrive.toLowerCase().indexOf('uploads');
  if (uploadsIndex === -1) {
    // Try to find media type directories directly
    const mediaTypes = ['photo', 'signature', 'thumb', 'education', 'csc', 'workcert', 'certificate', 'leave'];
    for (const mediaType of mediaTypes) {
      const typeIndex = pathAfterDrive.toLowerCase().indexOf(mediaType);
      if (typeIndex !== -1) {
        // Extract filename
        const parts = pathAfterDrive.split('/');
        const filename = parts[parts.length - 1];
        try {
          const dockerDir = getMediaDirectory(mediaType);
          // Normalize to forward slashes and ensure absolute path
          let normalizedDir = String(dockerDir).replace(/\\/g, '/');
          // Remove any trailing slashes
          normalizedDir = normalizedDir.replace(/\/+$/, '');
          // Ensure leading slash for absolute path
          if (!normalizedDir.startsWith('/')) {
            normalizedDir = '/' + normalizedDir;
          }
          // Construct final path with forward slashes
          return normalizedDir + '/' + filename;
        } catch {
          // Fallback to MEDIA_BASE_DIR - ensure absolute path with forward slashes
          let mediaBaseDir = (process.env.MEDIA_BASE_DIR || '/app/uploads').replace(/\\/g, '/');
          // Remove any trailing slashes
          mediaBaseDir = mediaBaseDir.replace(/\/+$/, '');
          // Ensure leading slash
          if (!mediaBaseDir.startsWith('/')) {
            mediaBaseDir = '/' + mediaBaseDir;
          }
          return mediaBaseDir + '/' + mediaType + '/' + filename;
        }
      }
    }
    return null;
  }
  
  // Extract relative path from "uploads" onwards
  const relativePath = pathAfterDrive.substring(uploadsIndex);
  // relativePath is now like "uploads/photo/filename.jpg"
  
  // Extract media type and filename
  const pathParts = relativePath.split('/');
  if (pathParts.length < 3) return null; // Should be "uploads/type/filename"
  
  const mediaType = pathParts[1]; // "photo", "signature", "thumb", etc.
  const filename = pathParts[2];
  
  // Use getMediaDirectory to get the correct Docker container path
  try {
    const dockerDir = getMediaDirectory(mediaType);
    // Normalize to forward slashes and ensure absolute path
    let normalizedDir = String(dockerDir).replace(/\\/g, '/');
    // Remove any trailing slashes
    normalizedDir = normalizedDir.replace(/\/+$/, '');
    // Ensure leading slash for absolute path
    if (!normalizedDir.startsWith('/')) {
      normalizedDir = '/' + normalizedDir;
    }
    // Construct final path with forward slashes
    const finalPath = normalizedDir + '/' + filename;
    return finalPath;
  } catch {
    // Fallback to MEDIA_BASE_DIR - ensure absolute path with forward slashes
    let mediaBaseDir = (process.env.MEDIA_BASE_DIR || '/app/uploads').replace(/\\/g, '/');
    // Remove any trailing slashes
    mediaBaseDir = mediaBaseDir.replace(/\/+$/, '');
    // Ensure leading slash
    if (!mediaBaseDir.startsWith('/')) {
      mediaBaseDir = '/' + mediaBaseDir;
    }
    return mediaBaseDir + '/' + mediaType + '/' + filename;
  }
}

/**
 * Resolve file path, handling Windows absolute paths in Docker containers
 * @param {string} filePath - File path (can be Windows absolute, Linux absolute, or relative)
 * @returns {string} - Resolved path for Docker container
 */
function resolveFilePath(filePath) {
  if (!filePath) return null;
  
  // Check if it's a Windows absolute path
  const isWindowsPath = /^[A-Za-z]:\\/.test(filePath);
  if (isWindowsPath) {
    // Only convert to Docker path if we're actually running in Docker
    const inDocker = isRunningInDocker();
    if (inDocker) {
      const dockerPath = convertWindowsPathToDockerPath(filePath);
      if (dockerPath) {
        // Final normalization to ensure Linux absolute path
        let normalized = String(dockerPath).replace(/\\/g, '/');
        // Ensure leading slash
        if (!normalized.startsWith('/')) {
          normalized = '/' + normalized;
        }
        console.log(`🔄 Converted Windows path: ${filePath} → ${normalized}`);
        return normalized;
      }
      // If conversion fails in Docker, return null instead of falling through
      // This prevents Windows paths from being incorrectly treated as relative paths
      console.warn(`⚠️ Could not convert Windows path: ${filePath}`);
      return null;
    } else {
      // Running locally on Windows - use the Windows path as-is
      return filePath;
    }
  }
  
  // Handle Linux/Unix absolute paths (starts with /)
  if (filePath.startsWith('/')) {
    // Ensure forward slashes
    return filePath.replace(/\\/g, '/');
  }
  
  // Handle relative paths
  const normalizedPath = filePath.replace(/\\/g, '/');
  const joinedPath = path.join(process.cwd(), normalizedPath);
  // Normalize path separators: use forward slashes in Docker, platform-specific otherwise
  const inDocker = isRunningInDocker();
  if (inDocker) {
    return joinedPath.replace(/\\/g, '/');
  }
  return joinedPath;
}

/**
 * Save media file to appropriate directory
 * @param {Buffer} buffer - Image buffer
 * @param {string} type - 'signature', 'photo', or 'thumb'
 * @param {string} employeeObjId - Employee unique ID
 * @returns {string} - Relative file path
 */
export async function saveMediaFile(buffer, type, employeeObjId) {
  if (!buffer || !type || !employeeObjId) {
    throw new Error('Missing required parameters');
  }

  // Check if pathid exists FIRST - this tells us if folders are configured
  const pathid = getMediaPathId(type);
  
  if (!pathid) {
    // This should not happen if folders are properly configured
    console.error(`❌ [saveMediaFile] CRITICAL: No pathid found for type ${type}!`);
    console.error(`❌ [saveMediaFile] Media folders may not be configured in media_path table.`);
    console.error(`❌ [saveMediaFile] Please configure folders via Media Storage component.`);
    throw new Error(`Media folder not configured for type: ${type}. Please configure folders in Media Storage settings.`);
  }

  // Now get the directory - this should work since pathid exists
  let directory;
  try {
    directory = getMediaDirectory(type);
  } catch (error) {
    console.error(`❌ [saveMediaFile] Error getting directory for type ${type}:`, error.message);
    throw new Error(`Media directory not configured for type: ${type}. Please configure folders in Media Storage settings.`);
  }

  const extension = getMediaExtension(type);
  
  // If directory is a UNC path on Windows, establish network credentials first
  // Also try to convert UNC to a mapped drive if direct access fails
  let actualDirectory = directory;
  if (process.platform === 'win32' && directory.startsWith('\\\\')) {
    try {
      const pool = getHR201Pool();
      const [networkRows] = await pool.execute('SELECT * FROM network_FSC WHERE is_enabled = 1 LIMIT 1');
      
      if (networkRows.length > 0) {
        const networkConfig = networkRows[0];
        console.log(`🔐 [saveMediaFile] Attempting to decrypt password for network share`);
        console.log(`🔐 [saveMediaFile] Password format: ${networkConfig.password ? (networkConfig.password.includes(':') ? 'encrypted (iv:encrypted)' : 'plain text or other') : 'null'}`);
        
        const password = decryptPassword(networkConfig.password);
        
        if (password) {
          console.log(`✅ [saveMediaFile] Password decrypted successfully`);
          // Extract UNC base path (\\server\share)
          const uncBasePath = `\\\\${networkConfig.server_ip}\\${networkConfig.share_name}`;
          // For Windows UNC paths, always try to map a drive letter
          // Node.js has issues writing directly to UNC paths, so we need a mapped drive
          let driveLetter = null;
          
          // First, establish credentials
          const credentialResult = await getOrEstablishCredentials(
            uncBasePath,
            networkConfig.username,
            password,
            networkConfig.domain || ''
          );
          
          if (!credentialResult.success) {
            console.warn(`⚠️ [saveMediaFile] Failed to establish network credentials - file save may fail`);
          } else {
            // Check if a drive is already mapped
            if (credentialResult.driveLetter) {
              driveLetter = credentialResult.driveLetter;
              console.log(`✅ [saveMediaFile] Using cached mapped drive ${driveLetter}:`);
            } else {
              // Try to find an existing mapped drive
              try {
                const { stdout } = await execAsync('net use');
                const driveMatch = stdout.match(new RegExp(`([A-Z]):\\s+${uncBasePath.replace(/\\/g, '\\\\')}`, 'i'));
                if (driveMatch) {
                  driveLetter = driveMatch[1];
                  console.log(`✅ [saveMediaFile] Found existing mapped drive ${driveLetter}:`);
                }
              } catch (driveCheckError) {
                // Could not check, will try to map
              }
              
              // If still no drive, force mapping (required for writing to UNC paths)
              if (!driveLetter) {
                console.log(`🔄 [saveMediaFile] No mapped drive found, mapping one for write access...`);
                driveLetter = await mapNetworkDrive(
                  uncBasePath,
                  networkConfig.username,
                  password,
                  networkConfig.domain || ''
                );
                
                if (driveLetter) {
                  // Cache the mapped drive
                  credentialCache.set(uncBasePath, {
                    driveLetter,
                    lastVerified: Date.now(),
                    username: networkConfig.username,
                    password,
                    domain: networkConfig.domain || ''
                  });
                }
              }
            }
            
            // Use mapped drive if available
            if (driveLetter) {
              actualDirectory = directory.replace(uncBasePath, `${driveLetter}:`);
              console.log(`✅ [saveMediaFile] Using mapped drive ${driveLetter}: instead of UNC path`);
              console.log(`✅ [saveMediaFile] Converted: ${directory} → ${actualDirectory}`);
            } else {
              console.warn(`⚠️ [saveMediaFile] Could not map drive letter - writes to UNC path may fail with EPERM`);
            }
          }
        } else {
          console.error(`❌ [saveMediaFile] Could not decrypt password for network share access`);
          console.error(`❌ [saveMediaFile] Password value: ${networkConfig.password ? (networkConfig.password.length > 50 ? networkConfig.password.substring(0, 50) + '...' : networkConfig.password) : 'null'}`);
          console.error(`❌ [saveMediaFile] This will likely cause file save to fail`);
          // Don't throw - let it try anyway, might work if credentials are cached
        }
      } else {
        console.warn(`⚠️ [saveMediaFile] No network share configuration found`);
      }
    } catch (error) {
      console.error(`❌ [saveMediaFile] Error establishing network credentials: ${error.message}`);
      console.error(`❌ [saveMediaFile] Stack: ${error.stack}`);
      // Continue anyway - might work if credentials are already cached
    }
  }
  
  // Ensure directory exists (use actualDirectory which may be a mapped drive)
  // Retry with credential refresh if it fails
  let retryCount = 0;
  const maxRetries = 2;
  
  while (retryCount <= maxRetries) {
    try {
      // Try to create directory with recursive option
      await fs.mkdir(actualDirectory, { recursive: true });
      
      // Verify the directory was actually created and we can write to it
      try {
        const testFile = path.join(actualDirectory, `.test_${Date.now()}.tmp`);
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
        console.log(`📁 [saveMediaFile] Directory ensured and verified: ${actualDirectory}`);
      } catch (verifyError) {
        console.warn(`⚠️ [saveMediaFile] Directory ${actualDirectory} exists but cannot write to it: ${verifyError.message}`);
        throw verifyError; // Re-throw to trigger retry
      }
      
      break; // Success, exit retry loop
    } catch (mkdirError) {
      if (retryCount < maxRetries && process.platform === 'win32' && (actualDirectory.startsWith('\\\\') || actualDirectory.match(/^[A-Z]:\\/))) {
        // Try to force drive mapping and retry
        console.log(`🔄 [saveMediaFile] Directory creation failed, forcing drive mapping (attempt ${retryCount + 1}/${maxRetries})`);
        const pool = getHR201Pool();
        const [networkRows] = await pool.execute('SELECT * FROM network_FSC WHERE is_enabled = 1 LIMIT 1');
        
        if (networkRows.length > 0) {
          const networkConfig = networkRows[0];
          const password = decryptPassword(networkConfig.password);
          if (password) {
            const uncBasePath = `\\\\${networkConfig.server_ip}\\${networkConfig.share_name}`;
            
            // Force drive mapping - clear cache first
            credentialCache.delete(uncBasePath);
            
            // Try to map a drive letter
            const driveLetter = await mapNetworkDrive(
              uncBasePath,
              networkConfig.username,
              password,
              networkConfig.domain || ''
            );
            
            if (driveLetter) {
              actualDirectory = directory.replace(uncBasePath, `${driveLetter}:`);
              
              // Cache the mapped drive
              credentialCache.set(uncBasePath, {
                driveLetter,
                lastVerified: Date.now(),
                username: networkConfig.username,
                password,
                domain: networkConfig.domain || ''
              });
              
              console.log(`🔄 [saveMediaFile] Mapped drive ${driveLetter}: and retrying: ${actualDirectory}`);
            } else {
              console.error(`❌ [saveMediaFile] Could not map drive letter for directory creation`);
            }
          }
        }
        retryCount++;
      } else {
        // No more retries or not a network path
        console.error(`❌ [saveMediaFile] Failed to create directory: ${actualDirectory}`);
        console.error(`❌ [saveMediaFile] Error: ${mkdirError.message}`);
        throw new Error(`Failed to create directory for ${type}: ${mkdirError.message}`);
      }
    }
  }

  const filename = `${employeeObjId}.${extension}`;
  let filePath = path.join(actualDirectory, filename);

  console.log(`💾 Saving ${type} file for employee objid: ${employeeObjId}`);
  console.log(`💾 Filename: ${filename}`);
  console.log(`💾 Full path: ${filePath}`);
  console.log(`💾 Using pathid: ${pathid}`);
  console.log(`💾 Buffer size: ${buffer.length} bytes`);
  
  // Retry file write with credential refresh if it fails
  retryCount = 0;
  while (retryCount <= maxRetries) {
    try {
      // Before writing, verify we have write access to the directory
      if (process.platform === 'win32' && actualDirectory.match(/^[A-Z]:\\/)) {
        // It's a mapped drive, verify access and test write
        try {
          await fs.access(actualDirectory, fs.constants.W_OK);
          
          // Also test actual write by creating a temporary file
          const testWritePath = path.join(actualDirectory, `.test_write_${Date.now()}.tmp`);
          try {
            await fs.writeFile(testWritePath, 'test');
            await fs.unlink(testWritePath);
            console.log(`✅ [saveMediaFile] Verified write access to ${actualDirectory}`);
          } catch (testWriteError) {
            console.warn(`⚠️ [saveMediaFile] Cannot write test file to ${actualDirectory}: ${testWriteError.message}`);
            throw testWriteError; // Trigger remapping
          }
        } catch (accessError) {
          console.warn(`⚠️ [saveMediaFile] No write access to ${actualDirectory}, attempting to remap drive`);
          // Try to remap the drive
          const pool = getHR201Pool();
          const [networkRows] = await pool.execute('SELECT * FROM network_FSC WHERE is_enabled = 1 LIMIT 1');
          if (networkRows.length > 0) {
            const networkConfig = networkRows[0];
            const password = decryptPassword(networkConfig.password);
            if (password) {
              const uncBasePath = `\\\\${networkConfig.server_ip}\\${networkConfig.share_name}`;
              credentialCache.delete(uncBasePath);
              const driveLetter = await mapNetworkDrive(uncBasePath, networkConfig.username, password, networkConfig.domain || '');
              if (driveLetter) {
                actualDirectory = directory.replace(uncBasePath, `${driveLetter}:`);
                filePath = path.join(actualDirectory, filename);
                console.log(`🔄 [saveMediaFile] Remapped to ${driveLetter}: and updated path: ${filePath}`);
              } else {
                console.error(`❌ [saveMediaFile] Could not remap drive - file save will likely fail`);
              }
            }
          }
        }
      }
      
      // Check if file already exists and try to delete it first
      try {
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          console.log(`⚠️ [saveMediaFile] File already exists, attempting to delete: ${filePath}`);
          try {
            // Try to remove read-only attribute if present
            if (process.platform === 'win32') {
              await execAsync(`attrib -r "${filePath}"`).catch(() => {});
            }
            await fs.unlink(filePath);
            console.log(`✅ [saveMediaFile] Deleted existing file: ${filePath}`);
          } catch (deleteError) {
            console.warn(`⚠️ [saveMediaFile] Could not delete existing file: ${deleteError.message}`);
            // Continue anyway - might be able to overwrite
          }
        }
      } catch (statError) {
        // File doesn't exist, which is fine
      }
      
      // Try to write the file with explicit flags
      // Use 'w' flag to truncate if exists, or 'wx' to fail if exists
      // For network drives, we'll use 'w' to allow overwriting
      const writeOptions = {
        flag: 'w', // Open for writing, truncate if exists
        mode: 0o666 // Read/write permissions for all
      };
      
      // For Windows network drives, try using fs.open with explicit flags
      if (process.platform === 'win32' && filePath.match(/^[A-Z]:\\/)) {
        try {
          // Use fs.open with explicit flags for better control
          const fileHandle = await fs.open(filePath, 'w', 0o666);
          try {
            // Write the buffer in chunks if needed
            await fileHandle.write(buffer, 0, buffer.length);
            await fileHandle.sync(); // Force sync to disk
            await fileHandle.close();
            console.log(`✅ Saved ${type} successfully as ${filename} (using fileHandle)`);
            break; // Success, exit retry loop
          } catch (handleWriteError) {
            await fileHandle.close().catch(() => {});
            throw handleWriteError;
          }
        } catch (handleError) {
          // If fileHandle approach fails, fall back to writeFile
          console.log(`⚠️ [saveMediaFile] FileHandle approach failed: ${handleError.message}, trying writeFile`);
          await fs.writeFile(filePath, buffer, writeOptions);
        }
      } else {
        await fs.writeFile(filePath, buffer, writeOptions);
      }
      console.log(`✅ Saved ${type} successfully as ${filename}`);
      break; // Success, exit retry loop
    } catch (writeError) {
      if (retryCount < maxRetries && writeError.code === 'EPERM' && process.platform === 'win32' && (filePath.startsWith('\\\\') || filePath.match(/^[A-Z]:\\/))) {
        // EPERM on network path - diagnose and try to fix
        console.log(`🔄 [saveMediaFile] Write failed with EPERM, diagnosing issue (attempt ${retryCount + 1}/${maxRetries})`);
        
        // Check if it's a mapped drive and verify it still exists
        if (filePath.match(/^[A-Z]:\\/)) {
          const driveLetter = filePath[0];
          try {
            // Check if drive is still mapped
            const { stdout } = await execAsync('net use');
            if (!stdout.includes(`${driveLetter}:`)) {
              console.warn(`⚠️ [saveMediaFile] Drive ${driveLetter}: is no longer mapped, will remap`);
            } else {
              console.warn(`⚠️ [saveMediaFile] Drive ${driveLetter}: is mapped but cannot write - permissions issue?`);
              // Try to verify we can at least read
              try {
                await fs.readdir(`${driveLetter}:\\`);
                console.log(`ℹ️ [saveMediaFile] Can read from ${driveLetter}: but cannot write`);
              } catch (readError) {
                console.error(`❌ [saveMediaFile] Cannot even read from ${driveLetter}: - ${readError.message}`);
              }
            }
          } catch (netUseError) {
            console.warn(`⚠️ [saveMediaFile] Could not check drive mapping: ${netUseError.message}`);
          }
        }
        
        const pool = getHR201Pool();
        const [networkRows] = await pool.execute('SELECT * FROM network_FSC WHERE is_enabled = 1 LIMIT 1');
        
        if (networkRows.length > 0) {
          const networkConfig = networkRows[0];
          const password = decryptPassword(networkConfig.password);
          if (password) {
            const uncBasePath = `\\\\${networkConfig.server_ip}\\${networkConfig.share_name}`;
            
            // Force drive mapping - clear cache first
            credentialCache.delete(uncBasePath);
            
            // Disconnect any existing mappings to this UNC path
            try {
              const { stdout } = await execAsync('net use');
              const lines = stdout.split('\n');
              for (const line of lines) {
                if (line.includes(uncBasePath)) {
                  const match = line.match(/^([A-Z]):/);
                  if (match) {
                    const existingDrive = match[1];
                    console.log(`🔄 [saveMediaFile] Disconnecting existing mapping ${existingDrive}:`);
                    await execAsync(`net use ${existingDrive}: /delete /y`).catch(() => {});
                  }
                }
              }
            } catch {
              // Ignore errors
            }
            
            // Try to map a drive letter with write verification
            const driveLetter = await mapNetworkDrive(
              uncBasePath,
              networkConfig.username,
              password,
              networkConfig.domain || ''
            );
            
            if (driveLetter) {
              // Update paths to use mapped drive
              actualDirectory = directory.replace(uncBasePath, `${driveLetter}:`);
              filePath = path.join(actualDirectory, filename);
              
              // Cache the mapped drive
              credentialCache.set(uncBasePath, {
                driveLetter,
                lastVerified: Date.now(),
                username: networkConfig.username,
                password,
                domain: networkConfig.domain || ''
              });
              
              console.log(`🔄 [saveMediaFile] Mapped drive ${driveLetter}: and retrying: ${filePath}`);
            } else {
              console.error(`❌ [saveMediaFile] Could not map drive letter with write access - file save will fail`);
              console.error(`❌ [saveMediaFile] ============================================`);
              console.error(`❌ [saveMediaFile] TROUBLESHOOTING NETWORK SHARE PERMISSIONS:`);
              console.error(`❌ [saveMediaFile] ============================================`);
              console.error(`❌ [saveMediaFile] 1. Verify user "${networkConfig.username}" has WRITE permissions to ${uncBasePath}`);
              console.error(`❌ [saveMediaFile] 2. Check network share settings allow write access`);
              console.error(`❌ [saveMediaFile] 3. Ensure Node.js process is running with appropriate permissions`);
              console.error(`❌ [saveMediaFile] 4. Try manually mapping the drive: net use Z: "${uncBasePath}" /user:${networkConfig.username} "${password}"`);
              console.error(`❌ [saveMediaFile] 5. Then test write access: echo test > Z:\\test.txt`);
              console.error(`❌ [saveMediaFile] 6. If manual mapping works but Node.js doesn't, this is a process context issue`);
              console.error(`❌ [saveMediaFile] ============================================`);
            }
          }
        }
        retryCount++;
      } else {
        // No more retries or different error
        console.error(`❌ [saveMediaFile] Failed to write file: ${filePath}`);
        console.error(`❌ [saveMediaFile] Error code: ${writeError.code}`);
        console.error(`❌ [saveMediaFile] Error message: ${writeError.message}`);
        console.error(`❌ [saveMediaFile] Error stack: ${writeError.stack}`);
        throw new Error(`Failed to save ${type} file: ${writeError.message}`);
      }
    }
  }

  // Return pathid for use in employees_media table
  console.log(`✅ [saveMediaFile] Returning pathid ${pathid} for type ${type}`);
  return { pathid, filePath };
}

/**
 * Delete old media file
 * @param {string|number} filePathOrPathId - File path or pathid (integer)
 * @param {string} employeeObjId - Employee object ID (required if filePathOrPathId is pathid)
 * @param {string} type - Media type (required if filePathOrPathId is pathid)
 */
export async function deleteMediaFile(filePathOrPathId, employeeObjId = null, type = null) {
  if (!filePathOrPathId && filePathOrPathId !== 0) return; // Allow 0 as valid pathid

  try {
    let fullPath;
    
    // Since columns are now INT, filePathOrPathId will always be a number (or null)
    // If employeeObjId and type are provided, treat it as pathid
    if (employeeObjId && type && (typeof filePathOrPathId === 'number' || (typeof filePathOrPathId === 'string' && /^\d+$/.test(filePathOrPathId)))) {
      // Resolve pathid to full file path
      fullPath = await resolvePathIdToFilePath(Number(filePathOrPathId), employeeObjId, type);
      if (!fullPath) {
        console.warn(`⚠️ Could not resolve pathid ${filePathOrPathId} for deletion`);
        return;
      }
    } else {
      // Fallback: treat as file path (for backward compatibility)
      fullPath = resolveFilePath(String(filePathOrPathId));
      if (!fullPath) {
        console.warn(`⚠️ Could not resolve path for deletion: ${filePathOrPathId}`);
        return;
      }
    }
    
    await fs.unlink(fullPath);
    console.log(`🗑️ Deleted old file (pathid: ${filePathOrPathId}): ${fullPath}`);
  } catch (error) {
    console.warn(`⚠️ Could not delete file (pathid: ${filePathOrPathId}):`, error.message);
  }
}

/**
 * Check if file exists
 * @param {string} filePath - File path (can be Windows absolute, Linux absolute, or relative)
 * @returns {boolean}
 */
export async function fileExists(filePath) {
  if (!filePath) return false;

  try {
    const fullPath = resolveFilePath(filePath);
    if (!fullPath) return false;
    
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve pathid to full file path
 * @param {number|string} pathid - Path ID from media_path table
 * @param {string} employeeObjId - Employee object ID for filename
 * @param {string} type - Media type (photo, signature, thumb)
 * @returns {Promise<string|null>} - Full file path or null
 */
async function resolvePathIdToFilePath(pathid, employeeObjId, type) {
  if (!pathid || !employeeObjId || !type) {
    return null;
  }
  
  try {
    const pool = getHR201Pool();
    
    // Get media_path record
    const [rows] = await pool.execute('SELECT mediapath, foldername FROM media_path WHERE pathid = ?', [pathid]);
    
    if (rows.length === 0) {
      console.warn(`⚠️ No media_path found for pathid: ${pathid}`);
      return null;
    }
    
    const mediapath = rows[0].mediapath;
    const foldername = rows[0].foldername;
    
    if (!mediapath) {
      console.warn(`⚠️ Empty mediapath for pathid: ${pathid}`);
      return null;
    }
    
    // Check if network share is enabled
    let finalMediaPath = mediapath;
    try {
      const [networkRows] = await pool.execute('SELECT * FROM network_FSC WHERE is_enabled = 1 LIMIT 1');
      
      console.log(`🔍 [resolvePathIdToFilePath] Checking network share for pathid ${pathid}, mediapath: "${mediapath}", foldername: "${foldername}"`);
      
      if (networkRows.length > 0 && networkRows[0].is_enabled) {
        const networkConfig = networkRows[0];
        console.log(`🌐 [resolvePathIdToFilePath] Network share enabled: ${networkConfig.server_ip}/${networkConfig.share_name}, share_path: ${networkConfig.share_path || 'none'}`);
        
        // Construct path using: server_ip + share_name + share_path + foldername
        // This is the correct structure regardless of what's stored in mediapath
        const inDocker = isRunningInDocker();
        
        if (process.platform === 'win32' && !inDocker) {
          // Windows (local, not Docker): Use UNC path
          // Structure: \\server_ip\share_name\share_path\foldername
          let pathParts = [];
          
          // Add share_path if it exists
          if (networkConfig.share_path && networkConfig.share_path.trim()) {
            pathParts.push(networkConfig.share_path.trim());
          }
          
          // Add foldername
          if (foldername && foldername.trim()) {
            pathParts.push(foldername.trim());
          }
          
          // Build UNC path: \\server_ip\share_name\[share_path\]\[foldername]
          const sharePath = pathParts.length > 0 ? pathParts.join('\\') : '';
          if (sharePath) {
            finalMediaPath = `\\\\${networkConfig.server_ip}\\${networkConfig.share_name}\\${sharePath}`;
          } else {
            finalMediaPath = `\\\\${networkConfig.server_ip}\\${networkConfig.share_name}`;
          }
        } else {
          // Linux/Docker: Use mounted path
          // Structure: /mnt/hris/share_path/foldername
          let pathParts = [];
          
          // Add share_path if it exists
          if (networkConfig.share_path && networkConfig.share_path.trim()) {
            pathParts.push(networkConfig.share_path.trim());
          }
          
          // Add foldername
          if (foldername && foldername.trim()) {
            pathParts.push(foldername.trim());
          }
          
          // Build mounted path: /mnt/hris/[share_path]/[foldername]
          const mountPoint = process.env.NETWORK_SHARE_MOUNT_POINT || '/mnt/hris';
          const sharePath = pathParts.length > 0 ? pathParts.join('/') : '';
          if (sharePath) {
            finalMediaPath = `${mountPoint}/${sharePath}`;
          } else {
            finalMediaPath = mountPoint;
          }
        }
        
        console.log(`🌐 [Network Share] Constructed path: ${finalMediaPath} (server: ${networkConfig.server_ip}, share: ${networkConfig.share_name}, share_path: ${networkConfig.share_path || 'none'}, folder: ${foldername || 'none'})`);
      } else {
        // Network share not enabled
        console.log(`⚠️ [resolvePathIdToFilePath] Network share not enabled, using local paths`);
        // If it's relative, it might need to be resolved to absolute
        if (!mediapath.startsWith('\\\\') && !mediapath.startsWith('//') && !mediapath.startsWith('/') && !mediapath.match(/^[A-Za-z]:/)) {
          // Relative path - resolve to absolute based on environment
          const inDocker = isRunningInDocker();
          if (inDocker) {
            finalMediaPath = path.join('/app/uploads', mediapath);
          } else {
            finalMediaPath = path.join(process.cwd(), 'backend', 'uploads', mediapath);
          }
          console.log(`📁 [resolvePathIdToFilePath] Resolved relative path to local: ${finalMediaPath}`);
        } else {
          finalMediaPath = mediapath;
          console.log(`📁 [resolvePathIdToFilePath] Using absolute path as-is: ${finalMediaPath}`);
        }
      }
    } catch (networkError) {
      console.warn(`⚠️ Error checking network share config: ${networkError.message}, using mediapath as-is`);
      // Fallback to using mediapath as-is
      finalMediaPath = mediapath;
    }
    
    // Construct full path: finalMediaPath + filename
    const extension = getMediaExtension(type);
    const filename = `${employeeObjId}.${extension}`;
    
    // Handle path joining based on path type
    let fullPath;
    if (finalMediaPath.startsWith('\\\\') || finalMediaPath.startsWith('//')) {
      // UNC path - use backslashes on Windows
      if (process.platform === 'win32') {
        const normalizedPath = finalMediaPath.replace(/\//g, '\\').replace(/\\+$/, '');
        fullPath = `${normalizedPath}\\${filename}`;
      } else {
        const normalizedPath = finalMediaPath.replace(/\\/g, '/').replace(/\/+$/, '');
        fullPath = `${normalizedPath}/${filename}`;
      }
    } else {
      // Regular path - use path.join
      fullPath = path.join(finalMediaPath, filename);
    }
    
    console.log(`🔍 Resolved pathid ${pathid} to: ${fullPath}`);
    return fullPath;
  } catch (error) {
    console.error(`❌ Error resolving pathid ${pathid}:`, error.message);
    return null;
  }
}

/**
 * Check if network credentials are still valid
 * @param {string} uncPath - UNC path
 * @param {string} driveLetter - Mapped drive letter (if any)
 * @returns {Promise<boolean>} - True if credentials are valid
 */
async function verifyNetworkCredentials(uncPath, driveLetter = null) {
  if (process.platform !== 'win32') {
    return true; // Not Windows, no credentials needed
  }
  
  try {
    const testPath = driveLetter ? `${driveLetter}:\\` : uncPath;
    await fs.access(testPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get cached credentials or establish new ones
 * @param {string} uncPath - UNC path (e.g., \\server\share)
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string} domain - Domain (optional)
 * @returns {Promise<{success: boolean, driveLetter: string|null}>} - Credential result
 */
async function getOrEstablishCredentials(uncPath, username, password, domain = '') {
  if (process.platform !== 'win32') {
    return { success: true, driveLetter: null };
  }
  
  // Check cache first
  const cached = credentialCache.get(uncPath);
  if (cached) {
    // Verify cached credentials are still valid (check every 5 minutes)
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    if (now - cached.lastVerified < fiveMinutes) {
      // Recently verified, use cached
      console.log(`✅ [getOrEstablishCredentials] Using cached credentials for ${uncPath}`);
      return { success: true, driveLetter: cached.driveLetter };
    }
    
    // Verify credentials are still valid
    const isValid = await verifyNetworkCredentials(uncPath, cached.driveLetter);
    if (isValid) {
      cached.lastVerified = now;
      console.log(`✅ [getOrEstablishCredentials] Cached credentials still valid for ${uncPath}`);
      return { success: true, driveLetter: cached.driveLetter };
    } else {
      console.log(`🔄 [getOrEstablishCredentials] Cached credentials expired, re-establishing for ${uncPath}`);
      credentialCache.delete(uncPath);
      // Fall through to establish new credentials
    }
  }
  
  // Establish new credentials
  const result = await establishNetworkCredentials(uncPath, username, password, domain);
  
  if (result.success) {
    // Cache the credentials
    credentialCache.set(uncPath, {
      driveLetter: result.driveLetter,
      lastVerified: Date.now(),
      username,
      password,
      domain
    });
    console.log(`💾 [getOrEstablishCredentials] Cached credentials for ${uncPath}`);
  }
  
  return result;
}

/**
 * Establish network share credentials for UNC path access on Windows
 * @param {string} uncPath - UNC path (e.g., \\server\share)
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string} domain - Domain (optional)
 * @returns {Promise<{success: boolean, driveLetter: string|null}>} - Credential result
 */
async function establishNetworkCredentials(uncPath, username, password, domain = '') {
  if (process.platform !== 'win32') {
    // Not Windows, no need to establish credentials
    return { success: true, driveLetter: null };
  }
  
  try {
    // Disconnect any existing connections to avoid error 1219
    try {
      await execAsync(`net use "${uncPath}" /delete /y`).catch(() => {
        // Ignore errors if connection doesn't exist
      });
    } catch {
      // Ignore errors
    }
    
    // Establish credentials using net use (without drive letter - this should work for direct UNC access)
    let authCommand = `net use "${uncPath}" /user:${username} "${password}"`;
    if (domain) {
      authCommand = `net use "${uncPath}" /user:${domain}\\${username} "${password}"`;
    }
    
    try {
      await execAsync(authCommand);
      console.log(`✅ Established network credentials for ${uncPath}`);
      
      // Test access by trying to list the directory
      try {
        await fs.access(uncPath);
        console.log(`✅ Verified access to ${uncPath}`);
        return { success: true, driveLetter: null };
      } catch (accessError) {
        console.warn(`⚠️ Cannot access ${uncPath} after establishing credentials: ${accessError.message}`);
        console.log(`🔄 Attempting to map drive letter for ${uncPath}`);
        // Try mapping a temporary drive letter as fallback
        const driveLetter = await mapNetworkDrive(uncPath, username, password, domain);
        return { success: !!driveLetter, driveLetter };
      }
    } catch (authError) {
      console.warn(`⚠️ Failed to establish network credentials: ${authError.message}`);
      console.log(`🔄 Attempting to map drive letter for ${uncPath}`);
      // Try mapping a temporary drive letter as fallback
      const driveLetter = await mapNetworkDrive(uncPath, username, password, domain);
      return { success: !!driveLetter, driveLetter };
    }
  } catch (error) {
    console.warn(`⚠️ Error establishing network credentials: ${error.message}`);
    return { success: false, driveLetter: null };
  }
}

/**
 * Map network drive as fallback when direct UNC access fails
 * @param {string} uncPath - UNC path (e.g., \\server\share)
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string} domain - Domain (optional)
 * @returns {Promise<string|null>} - Drive letter if mapped successfully, null otherwise
 */
async function mapNetworkDrive(uncPath, username, password, domain = '') {
  // Try to find an available drive letter (Z: down to M:)
  const driveLetters = ['Z', 'Y', 'X', 'W', 'V', 'U', 'T', 'S', 'R', 'Q', 'P', 'O', 'N', 'M'];
  
  for (const driveLetter of driveLetters) {
    try {
      // Disconnect existing mapping if any
      await execAsync(`net use ${driveLetter}: /delete /y`).catch(() => {});
      
      // Map the drive with explicit permissions
      let mapCommand = `net use ${driveLetter}: "${uncPath}" /user:${username} "${password}" /persistent:no`;
      if (domain) {
        mapCommand = `net use ${driveLetter}: "${uncPath}" /user:${domain}\\${username} "${password}" /persistent:no`;
      }
      
      await execAsync(mapCommand);
      console.log(`✅ Mapped ${driveLetter}: to ${uncPath}`);
      
      // Wait a moment for the drive mapping to be fully available
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Verify the drive is accessible to Node.js
      try {
        await fs.access(`${driveLetter}:\\`);
        console.log(`✅ Drive ${driveLetter}: is accessible to Node.js`);
      } catch (accessError) {
        console.warn(`⚠️ Drive ${driveLetter}: is not accessible to Node.js: ${accessError.message}`);
        await execAsync(`net use ${driveLetter}: /delete /y`).catch(() => {});
        continue;
      }
      
      // Verify write access by attempting to create a test file
      // Try multiple locations to find one we can write to
      const testPaths = [
        `${driveLetter}:\\uploads\\test_write_access_${Date.now()}.tmp`,
        `${driveLetter}:\\test_write_access_${Date.now()}.tmp`
      ];
      
      let writeAccessVerified = false;
      let verifiedPath = null;
      let lastError = null;
      
      for (const testPath of testPaths) {
        try {
          // Ensure directory exists
          const testDir = path.dirname(testPath);
          try {
            await fs.mkdir(testDir, { recursive: true });
            console.log(`✅ Created/verified directory: ${testDir}`);
          } catch (mkdirError) {
            console.warn(`⚠️ Could not create directory ${testDir}: ${mkdirError.message}`);
            // Try to continue anyway - directory might already exist
          }
          
          // Try to write
          await fs.writeFile(testPath, 'test');
          // Verify we can read it back
          const content = await fs.readFile(testPath, 'utf8');
          if (content === 'test') {
            // Clean up
            await fs.unlink(testPath);
            console.log(`✅ Verified write access to ${driveLetter}: at ${testDir}`);
            writeAccessVerified = true;
            verifiedPath = testDir;
            break;
          }
        } catch (testError) {
          lastError = testError;
          console.log(`⚠️ Cannot write to ${testPath}: ${testError.message} (code: ${testError.code})`);
          // Try next location
          continue;
        }
      }
      
      if (writeAccessVerified) {
        console.log(`✅ Drive ${driveLetter}: mapped and verified with write access at ${verifiedPath}`);
        return driveLetter;
      } else {
        console.warn(`⚠️ Mapped ${driveLetter}: but cannot write to any test location`);
        if (lastError) {
          console.warn(`⚠️ Last error: ${lastError.message} (code: ${lastError.code})`);
        }
        // Check if we can at least read from it
        try {
          const files = await fs.readdir(`${driveLetter}:\\`);
          console.log(`ℹ️ Can read from ${driveLetter}: (found ${files.length} items) but cannot write`);
          console.log(`⚠️ This indicates a permissions issue - the user "${username}" may not have write access to the network share`);
          console.log(`⚠️ Please verify write permissions on ${uncPath} for user "${username}"`);
        } catch (readError) {
          console.warn(`⚠️ Cannot even read from ${driveLetter}: - ${readError.message}`);
        }
        // Don't disconnect - keep the mapping and let the caller handle it
        // The issue might be specific to certain subdirectories
        console.log(`ℹ️ Keeping drive ${driveLetter}: mapped - will attempt actual file write`);
        return driveLetter; // Return it anyway - might work for actual files
      }
    } catch (error) {
      console.warn(`⚠️ Failed to map ${driveLetter}: - ${error.message}`);
      // Try next drive letter
      continue;
    }
  }
  
  console.warn(`⚠️ Could not map any drive letter to ${uncPath}`);
  return null;
}

/**
 * Decrypt password from database (same logic as mediaStorageController)
 * @param {string} encryptedPassword - Encrypted password string (format: iv:encrypted) or plain text
 * @returns {string|null} - Decrypted password, plain text password, or null if invalid
 */
function decryptPassword(encryptedPassword) {
  if (!encryptedPassword || encryptedPassword === '***HIDDEN***') {
    return null;
  }
  
  try {
    // Check if the text is in the encrypted format (iv:encrypted)
    const parts = encryptedPassword.split(':');
    
    // If it doesn't have the colon separator, it might be plain text (backward compatibility)
    if (parts.length !== 2) {
      console.log('🔐 [decryptPassword] Password does not appear to be encrypted, treating as plain text');
      return encryptedPassword;
    }
    
    const ivHex = parts[0];
    const encrypted = parts[1];
    
    // Validate IV is valid hex and correct length (16 bytes = 32 hex chars)
    if (!ivHex || ivHex.length !== 32 || !/^[0-9a-fA-F]+$/.test(ivHex)) {
      console.log('🔐 [decryptPassword] Invalid IV format, treating password as plain text');
      return encryptedPassword;
    }
    
    // Validate encrypted part is valid hex
    if (!encrypted || !/^[0-9a-fA-F]+$/.test(encrypted)) {
      console.log('🔐 [decryptPassword] Invalid encrypted format, treating password as plain text');
      return encryptedPassword;
    }
    
    // Create IV buffer and validate it's exactly 16 bytes
    const iv = Buffer.from(ivHex, 'hex');
    if (iv.length !== 16) {
      console.log(`🔐 [decryptPassword] IV buffer length is ${iv.length} bytes, expected 16. Treating as plain text.`);
      return encryptedPassword;
    }
    
    // Get encryption key (same logic as mediaStorageController)
    const encryptionKey = process.env.ENCRYPTION_KEY;
    let keyBuffer;
    
    if (encryptionKey && encryptionKey.length >= 64 && /^[0-9a-fA-F]+$/.test(encryptionKey)) {
      keyBuffer = Buffer.from(encryptionKey.slice(0, 64), 'hex');
    } else {
      // Fallback: use scrypt (old method for backward compatibility)
      keyBuffer = crypto.scryptSync(encryptionKey || 'hris-default-key-change-in-production', 'salt', 32);
    }
    
    if (keyBuffer.length !== 32) {
      console.log(`🔐 [decryptPassword] Key buffer length is ${keyBuffer.length} bytes, expected 32. Treating as plain text.`);
      return encryptedPassword;
    }
    
    // Create encrypted buffer
    const encryptedBuffer = Buffer.from(encrypted, 'hex');
    
    // Decrypt
    const algorithm = 'aes-256-cbc';
    const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
    
    let decrypted = decipher.update(encryptedBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.warn(`⚠️ Password decryption failed: ${error.message}`);
    console.log(`🔐 [decryptPassword] Falling back to treating password as plain text`);
    // Fallback: return as plain text (might be unencrypted)
    return encryptedPassword;
  }
}

/**
 * Read media file as base64
 * @param {string|number} filePathOrPathId - File path or pathid (integer)
 * @param {string} employeeObjId - Employee object ID (required if filePathOrPathId is pathid)
 * @param {string} type - Media type (required if filePathOrPathId is pathid)
 * @returns {string} - Base64 data URL
 */
export async function readMediaAsBase64(filePathOrPathId, employeeObjId = null, type = null) {
  if (!filePathOrPathId && filePathOrPathId !== 0) { // Allow 0 as valid pathid
    return null;
  }

  try {
    let fullPath;
    
    // Since columns are now INT, filePathOrPathId will always be a number (or null)
    // If employeeObjId and type are provided, treat it as pathid
    if (employeeObjId && type && (typeof filePathOrPathId === 'number' || (typeof filePathOrPathId === 'string' && /^\d+$/.test(filePathOrPathId)))) {
      // Resolve pathid to full file path
      fullPath = await resolvePathIdToFilePath(Number(filePathOrPathId), employeeObjId, type);
      if (!fullPath) {
        console.warn(`⚠️ Could not resolve pathid ${filePathOrPathId} to file path`);
        return null;
      }
    } else {
      // Fallback: treat as file path (for backward compatibility with old data or edge cases)
      fullPath = resolveFilePath(String(filePathOrPathId));
      if (!fullPath) {
        console.warn(`⚠️ Could not resolve path: ${filePathOrPathId}`);
        return null;
      }
    }
    
    // If path is a UNC path on Windows, establish credentials first
    if (process.platform === 'win32' && (fullPath.startsWith('\\\\') || fullPath.startsWith('//'))) {
      try {
        // Extract UNC base path (\\server\share)
        const uncMatch = fullPath.match(/^(\\\\[^\\]+\\[^\\]+)/);
        if (uncMatch) {
          const uncBasePath = uncMatch[1];
          
          // Get network share credentials from database
          const pool = getHR201Pool();
          const [networkRows] = await pool.execute('SELECT * FROM network_FSC WHERE is_enabled = 1 LIMIT 1');
          
          if (networkRows.length > 0) {
            const networkConfig = networkRows[0];
            const password = decryptPassword(networkConfig.password);
            
            if (password) {
              const credentialResult = await getOrEstablishCredentials(
                uncBasePath,
                networkConfig.username || '',
                password,
                networkConfig.domain || ''
              );
              
              // If a drive letter was mapped, convert the path
              if (credentialResult.driveLetter && fullPath.startsWith(uncBasePath)) {
                fullPath = fullPath.replace(uncBasePath, `${credentialResult.driveLetter}:`);
                console.log(`🔄 [readMediaAsBase64] Using mapped drive: ${fullPath}`);
              }
            } else {
              console.warn(`⚠️ Could not decrypt password for network share access`);
            }
          }
        }
      } catch (credError) {
        console.warn(`⚠️ Error establishing network credentials: ${credError.message}`);
        // Continue anyway, might work if credentials are already cached
      }
    }
    
    const buffer = await fs.readFile(fullPath);
    
    // Determine extension from type or file path
    let extension = '';
    if (type) {
      extension = `.${getMediaExtension(type)}`;
    } else {
      extension = path.extname(String(filePathOrPathId));
    }
    
    const mimeType = getMimeType(extension);
    
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.warn(`⚠️ Could not read file (pathid: ${filePathOrPathId}, type: ${type}):`, error.message);
    if (employeeObjId && type) {
      const attemptedPath = await resolvePathIdToFilePath(Number(filePathOrPathId), employeeObjId, type);
      if (attemptedPath) {
        console.warn(`⚠️ Full path attempted: ${attemptedPath}`);
      }
    }
    return null;
  }
}
