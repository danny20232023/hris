import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initHR201Database, getHR201Pool } from '../config/hr201Database.js';
import crypto from 'crypto';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Encryption constants (matching mediaStorageController.js)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-cbc';

/**
 * Decrypt password from database (same logic as mediaStorageController.js)
 */
function decryptPassword(encryptedText) {
  if (!encryptedText) return null;
  
  try {
    // Check if the text is in the encrypted format (iv:encrypted)
    const parts = encryptedText.split(':');
    
    // If it doesn't have the colon separator, it might be plain text (backward compatibility)
    if (parts.length !== 2) {
      console.warn('⚠️  Password does not appear to be encrypted, treating as plain text');
      return encryptedText;
    }
    
    const ivHex = parts[0];
    const encrypted = parts[1];
    
    // Validate IV is valid hex and correct length (16 bytes = 32 hex chars)
    if (!ivHex || ivHex.length !== 32 || !/^[0-9a-fA-F]+$/.test(ivHex)) {
      console.warn('⚠️  Invalid IV format, treating password as plain text');
      return encryptedText;
    }
    
    // Validate encrypted part is valid hex
    if (!encrypted || !/^[0-9a-fA-F]+$/.test(encrypted)) {
      console.warn('⚠️  Invalid encrypted format, treating password as plain text');
      return encryptedText;
    }
    
    // Create IV buffer and validate it's exactly 16 bytes
    const iv = Buffer.from(ivHex, 'hex');
    if (iv.length !== 16) {
      console.warn(`⚠️  IV buffer length is ${iv.length} bytes, expected 16. Treating as plain text.`);
      return encryptedText;
    }
    
    // Create key buffer and validate it's exactly 32 bytes
    if (!ENCRYPTION_KEY) {
      console.warn('⚠️  ENCRYPTION_KEY not set, treating password as plain text');
      return encryptedText;
    }
    
    const keyBuffer = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
    if (keyBuffer.length !== 32) {
      console.warn(`⚠️  Key buffer length is ${keyBuffer.length} bytes, expected 32. Treating as plain text.`);
      return encryptedText;
    }
    
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    // If decryption fails, check if it looks encrypted
    const looksEncrypted = encryptedText.includes(':') && encryptedText.split(':').length === 2;
    
    if (looksEncrypted) {
      console.error('❌ Password decryption failed - password appears to be encrypted but cannot be decrypted:', error.message);
      console.error('❌ This usually means the ENCRYPTION_KEY has changed. User must re-enter the password.');
      return null;
    } else {
      console.warn('⚠️  Password does not appear to be encrypted, treating as plain text');
      return encryptedText;
    }
  }
}

/**
 * Construct full path using same logic as initMediaPaths() in uploadsConfig.js
 */
function constructFullPath(mediapath, foldername, networkConfig, mountPoint) {
  if (!mediapath || !foldername) return null;
  
  // If network share is enabled, construct network path
  if (networkConfig && networkConfig.is_enabled) {
    // For mount script, we're always on Linux/Docker host
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
    const sharePath = pathParts.length > 0 ? pathParts.join('/') : '';
    if (sharePath) {
      return `${mountPoint}/${sharePath}`;
    } else {
      return mountPoint;
    }
  } else {
    // No network share: use local path
    if (path.isAbsolute(mediapath)) {
      return path.join(mediapath, foldername);
    } else {
      // Relative path - construct from base directory
      const DEFAULT_BASE_DIR = process.env.MEDIA_BASE_DIR || path.join(__dirname, '..', 'uploads');
      return path.join(DEFAULT_BASE_DIR, mediapath, foldername);
    }
  }
}

/**
 * Mount network share using credentials from network_FSC table
 * This script should be run on the Docker HOST (not in container)
 */
async function mountNetworkShareFromDB() {
  console.log('🔍 Reading network share configuration from database...\n');
  
  try {
    // Initialize database connection
    await initHR201Database();
    const pool = getHR201Pool();
    
    // Get network share configuration from network_FSC table
    const [networkRows] = await pool.execute('SELECT * FROM network_FSC WHERE is_enabled = 1 LIMIT 1');
    
    if (networkRows.length === 0) {
      console.error('❌ Network share not configured or disabled in database');
      console.error('   Please configure it via the Media Storage component first');
      console.error('   Or set is_enabled = 1 in the network_FSC table');
      process.exit(1);
    }
    
    const networkConfig = networkRows[0];
    
    // Get media_path folders to verify expected structure
    const [mediaPathRows] = await pool.execute('SELECT * FROM media_path ORDER BY pathid');
    
    // Decrypt password
    const password = decryptPassword(networkConfig.password);
    
    if (!password) {
      console.error('❌ Could not decrypt password');
      console.error('   Please check ENCRYPTION_KEY environment variable');
      process.exit(1);
    }
    
    const mountPoint = process.env.NETWORK_SHARE_MOUNT_POINT || '/mnt/hris';
    const uncPath = `//${networkConfig.server_ip}/${networkConfig.share_name}`;
    const credentialsFile = '/etc/smb-credentials';
    
    console.log('📊 Network Share Configuration from database:');
    console.log(`   Server IP: ${networkConfig.server_ip}`);
    console.log(`   Share Name: ${networkConfig.share_name}`);
    console.log(`   Share Path: ${networkConfig.share_path || 'none'}`);
    console.log(`   Username: ${networkConfig.username}`);
    console.log(`   Domain: ${networkConfig.domain || 'none'}`);
    console.log(`   Mount Point: ${mountPoint}`);
    console.log(`   UNC Path: ${uncPath}`);
    
    if (mediaPathRows.length > 0) {
      console.log(`\n📁 Expected folders from media_path table (${mediaPathRows.length}):`);
      mediaPathRows.forEach(row => {
        const expectedPath = constructFullPath(row.mediapath, row.foldername, networkConfig, mountPoint);
        console.log(`   - ${row.foldername} (pathid: ${row.pathid}) → ${expectedPath || 'N/A'}`);
      });
    }
    console.log('');
    
    // Check if running as root (required for mount)
    if (process.getuid && process.getuid() !== 0) {
      console.error('❌ This script must be run as root (use sudo)');
      console.error('   Example: sudo node backend/scripts/mountNetworkShareFromDB.js');
      process.exit(1);
    }
    
    // Check if cifs-utils is installed
    try {
      await execAsync('which mount.cifs');
      console.log('✅ cifs-utils is installed');
    } catch {
      console.error('❌ cifs-utils is not installed');
      console.error('   Installing cifs-utils...');
      try {
        await execAsync('apt-get update && apt-get install -y cifs-utils');
        console.log('✅ cifs-utils installed');
      } catch (installError) {
        console.error(`❌ Failed to install cifs-utils: ${installError.message}`);
        console.error('   Please install manually: sudo apt-get install cifs-utils');
        process.exit(1);
      }
    }
    
    // Create mount point
    try {
      await fs.mkdir(mountPoint, { recursive: true });
      await execAsync(`chmod 755 ${mountPoint}`);
      console.log(`✅ Created/verified mount point: ${mountPoint}`);
    } catch (error) {
      console.error(`❌ Failed to create mount point: ${error.message}`);
      process.exit(1);
    }
    
    // Check if already mounted
    try {
      const { stdout } = await execAsync(`mountpoint -q ${mountPoint} && echo mounted || echo not_mounted`);
      if (stdout.trim() === 'mounted') {
        // Check if it's the correct share
        const { stdout: mountInfo } = await execAsync(`mount | grep ${mountPoint}`);
        if (mountInfo.includes(uncPath)) {
          console.log(`✅ Network share is already mounted at ${mountPoint}`);
          console.log('   Unmounting to remount with latest credentials...');
          await execAsync(`umount ${mountPoint}`).catch(() => {});
        } else {
          console.log(`⚠️  Different share is mounted at ${mountPoint}`);
          console.log('   Unmounting...');
          await execAsync(`umount ${mountPoint}`).catch(() => {});
        }
      }
    } catch {
      // Not mounted, continue
    }
    
    // Create credentials file
    console.log('📝 Creating credentials file...');
    const credentialsContent = `username=${networkConfig.username}
password=${password}
${networkConfig.domain ? `domain=${networkConfig.domain}` : ''}`;
    
    try {
      await fs.writeFile(credentialsFile, credentialsContent);
      await execAsync(`chmod 600 ${credentialsFile}`);
      console.log(`✅ Created credentials file: ${credentialsFile}`);
    } catch (error) {
      console.error(`❌ Failed to create credentials file: ${error.message}`);
      process.exit(1);
    }
    
    // Mount the share
    console.log('🔗 Mounting network share...');
    const mountOptions = [
      `credentials=${credentialsFile}`,
      'uid=1000',
      'gid=1000',
      'file_mode=0775',
      'dir_mode=0775',
      'vers=3.0'
    ].join(',');
    
    try {
      await execAsync(`mount -t cifs "${uncPath}" "${mountPoint}" -o ${mountOptions}`);
      console.log(`✅ Successfully mounted network share at ${mountPoint}`);
    } catch (error) {
      console.error(`❌ Failed to mount network share: ${error.message}`);
      console.error('');
      console.error('Troubleshooting:');
      console.error('  1. Check network connectivity: ping ' + networkConfig.server_ip);
      console.error('  2. Verify credentials are correct');
      console.error('  3. Check if share name exists: smbclient -L //' + networkConfig.server_ip + ' -U ' + networkConfig.username);
      console.error('  4. Check SMB version compatibility');
      process.exit(1);
    }
    
    // Verify mount
    try {
      await execAsync(`mountpoint -q ${mountPoint}`);
      console.log('✅ Mount verified successfully');
      
      // Test access
      const files = await fs.readdir(mountPoint);
      console.log(`✅ Mount is accessible (found ${files.length} items)`);
    } catch (error) {
      console.error(`❌ Mount verification failed: ${error.message}`);
      process.exit(1);
    }
    
    // Verify expected folders exist
    if (mediaPathRows.length > 0) {
      console.log('\n🔍 Verifying expected folder structure...');
      let allFoldersExist = true;
      
      for (const row of mediaPathRows) {
        const expectedPath = constructFullPath(row.mediapath, row.foldername, networkConfig, mountPoint);
        if (expectedPath) {
          try {
            await fs.access(expectedPath);
            console.log(`   ✅ ${row.foldername} exists: ${expectedPath}`);
          } catch {
            console.warn(`   ⚠️  ${row.foldername} does not exist: ${expectedPath}`);
            allFoldersExist = false;
          }
        }
      }
      
      if (!allFoldersExist) {
        console.warn('\n⚠️  Some expected folders are missing');
        console.warn('   They may need to be created on the network share');
      } else {
        console.log('\n✅ All expected folders exist');
      }
    }
    
    // Add to /etc/fstab for persistence
    console.log('\n📝 Adding to /etc/fstab for persistence...');
    const fstabEntry = `${uncPath} ${mountPoint} cifs ${mountOptions} 0 0`;
    
    try {
      const fstabContent = await fs.readFile('/etc/fstab', 'utf8');
      
      // Check if entry already exists
      if (fstabContent.includes(mountPoint)) {
        // Update existing entry
        const lines = fstabContent.split('\n');
        const updatedLines = lines.map(line => {
          if (line.includes(mountPoint) && line.includes('cifs')) {
            return fstabEntry;
          }
          return line;
        });
        await fs.writeFile('/etc/fstab', updatedLines.join('\n'));
        console.log('✅ Updated /etc/fstab entry');
      } else {
        // Add new entry
        await fs.appendFile('/etc/fstab', `\n${fstabEntry}\n`);
        console.log('✅ Added to /etc/fstab');
      }
    } catch (error) {
      console.warn(`⚠️  Could not update /etc/fstab: ${error.message}`);
      console.warn('   You may need to add it manually for persistence across reboots');
    }
    
    console.log('');
    console.log('✅ Network share mounted successfully!');
    console.log('');
    console.log('Mount details:');
    try {
      const { stdout } = await execAsync(`mount | grep ${mountPoint}`);
      console.log(stdout);
    } catch {}
    
    console.log('');
    console.log('📋 Next steps:');
    console.log('  1. Ensure docker-compose.yml has the volume mount: - /mnt/hris:/mnt/hris:rw');
    console.log('  2. Restart Docker containers: docker-compose restart');
    console.log('  3. Verify from container: docker exec hris-backend node scripts/checkNetworkShareMount.js');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error mounting network share:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
mountNetworkShareFromDB();

