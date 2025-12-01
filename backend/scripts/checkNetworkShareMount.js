import fs from 'fs/promises';
import path from 'path';
import { initHR201Database, getHR201Pool } from '../config/hr201Database.js';

/**
 * Construct full path using same logic as initMediaPaths() in uploadsConfig.js
 */
function constructFullPath(mediapath, foldername, networkConfig, mountPoint) {
  if (!mediapath || !foldername) return null;
  
  // If network share is enabled, construct network path
  if (networkConfig && networkConfig.is_enabled) {
    // For Docker/Linux: Use mounted path
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
      const DEFAULT_BASE_DIR = process.env.MEDIA_BASE_DIR || path.join(process.cwd(), 'uploads');
      return path.join(DEFAULT_BASE_DIR, mediapath, foldername);
    }
  }
}

/**
 * Check if network share is mounted and accessible
 * This script runs inside the Docker container to verify the mount
 */
async function checkNetworkShareMount() {
  console.log('🔍 Checking network share mount status...\n');
  
  const mountPoint = process.env.NETWORK_SHARE_MOUNT_POINT || '/mnt/hris';
  let mountExists = false;
  let mountAccessible = false;
  
  try {
    // Check if mount point exists
    try {
      await fs.access(mountPoint);
      console.log(`✅ Mount point exists: ${mountPoint}`);
      mountExists = true;
    } catch {
      console.error(`❌ Mount point does not exist: ${mountPoint}`);
      console.error(`   Please ensure the network share is bind-mounted in docker-compose.yml`);
      return false;
    }
    
    // Check if it's actually a mount point (not just a directory)
    try {
      const stats = await fs.stat(mountPoint);
      if (!stats.isDirectory()) {
        console.error(`❌ ${mountPoint} is not a directory`);
        return false;
      }
      
      // Try to read directory
      const files = await fs.readdir(mountPoint);
      console.log(`✅ Mount point is accessible (found ${files.length} items)`);
      mountAccessible = true;
    } catch (error) {
      console.error(`❌ Cannot access mount point: ${error.message}`);
      return false;
    }
    
    // Check database configuration
    try {
      const pool = getHR201Pool();
      
      // Get network_FSC configuration
      const [networkRows] = await pool.execute('SELECT * FROM network_FSC WHERE is_enabled = 1 LIMIT 1');
      
      if (networkRows.length > 0) {
        const config = networkRows[0];
        console.log(`\n📊 Network Share Configuration (network_FSC table):`);
        console.log(`   Server: ${config.server_ip}`);
        console.log(`   Share: ${config.share_name}`);
        console.log(`   Share Path: ${config.share_path || 'none'}`);
        console.log(`   Username: ${config.username}`);
        console.log(`   Domain: ${config.domain || 'none'}`);
        console.log(`   Enabled: ${config.is_enabled ? 'Yes' : 'No'}`);
        
        // Get media_path folders
        const [mediaPathRows] = await pool.execute('SELECT * FROM media_path ORDER BY pathid');
        
        if (mediaPathRows.length > 0) {
          console.log(`\n📁 Media Folders Configuration (media_path table):`);
          console.log(`   Found ${mediaPathRows.length} folder(s)`);
          
          // Check if expected folders exist
          console.log(`\n🔍 Verifying expected folder structure...`);
          let allFoldersExist = true;
          let foldersChecked = 0;
          
          for (const row of mediaPathRows) {
            const expectedPath = constructFullPath(row.mediapath, row.foldername, config, mountPoint);
            if (expectedPath) {
              foldersChecked++;
              try {
                await fs.access(expectedPath);
                console.log(`   ✅ ${row.foldername} (pathid: ${row.pathid}) exists: ${expectedPath}`);
              } catch {
                console.warn(`   ⚠️  ${row.foldername} (pathid: ${row.pathid}) does not exist: ${expectedPath}`);
                allFoldersExist = false;
              }
            } else {
              console.warn(`   ⚠️  ${row.foldername} (pathid: ${row.pathid}) - could not construct path`);
            }
          }
          
          if (foldersChecked === 0) {
            console.warn(`   ⚠️  No folders could be verified (network share may not be enabled)`);
          } else if (allFoldersExist) {
            console.log(`\n✅ All expected folders exist (${foldersChecked}/${mediaPathRows.length})`);
          } else {
            console.warn(`\n⚠️  Some expected folders are missing`);
            console.warn(`   They may need to be created on the network share`);
          }
        } else {
          console.log(`\n⚠️  No folders configured in media_path table`);
        }
      } else {
        console.log(`\n⚠️  Network share not configured in database (network_FSC table)`);
        console.log(`   The system will use local storage`);
      }
    } catch (error) {
      console.warn(`⚠️  Could not check database configuration: ${error.message}`);
    }
    
    // Test write access (if possible)
    if (mountAccessible) {
      try {
        const testFile = `${mountPoint}/.test_write_${Date.now()}.tmp`;
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
        console.log(`\n✅ Write access verified`);
      } catch (error) {
        console.warn(`\n⚠️  Write access test failed: ${error.message}`);
        console.warn(`   This may indicate a permissions issue`);
      }
    }
    
    console.log(`\n✅ Network share mount check completed`);
    return mountExists && mountAccessible;
  } catch (error) {
    console.error(`❌ Error checking network share mount: ${error.message}`);
    return false;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  import('../config/hr201Database.js').then(async ({ initHR201Database }) => {
    await initHR201Database();
    const result = await checkNetworkShareMount();
    process.exit(result ? 0 : 1);
  }).catch(error => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
}

export { checkNetworkShareMount };

