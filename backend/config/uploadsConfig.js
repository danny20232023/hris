import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getHR201Pool } from './hr201Database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default base directory - use MEDIA_BASE_DIR from environment if set
const DEFAULT_BASE_DIR = process.env.MEDIA_BASE_DIR || path.join(__dirname, '..', 'uploads');

// In-memory cache for paths
let MEDIA_PATHS = {
  photopath: null,
  signaturepath: null,
  thumbpath: null,
  educationpath: null,
  cscpath: null,
  workcertpath: null,
  certificatepath: null,
  leavepath: null
};

let MEDIA_DIRECTORIES = {};
let MEDIA_PATH_IDS = {}; // Map of type -> pathid

// Initialize media paths from database
export async function initMediaPaths() {
  try {
    const pool = getHR201Pool();
    
    // Load network share configuration
    let networkConfig = null;
    try {
      const [networkRows] = await pool.execute('SELECT * FROM network_FSC WHERE is_enabled = 1 LIMIT 1');
      if (networkRows.length > 0) {
        networkConfig = networkRows[0];
        console.log(`🌐 Network share enabled: ${networkConfig.server_ip}/${networkConfig.share_name}`);
      }
    } catch (error) {
      console.warn('⚠️ Could not load network share config:', error.message);
    }
    
    // Load all folders from media_path table
    const [rows] = await pool.execute('SELECT * FROM media_path ORDER BY pathid');
    
    if (rows.length > 0) {
      // Build MEDIA_DIRECTORIES and MEDIA_PATH_IDS from folder records
      MEDIA_DIRECTORIES = {};
      MEDIA_PATH_IDS = {};
      
      // Map foldername to media type
      const folderTypeMap = {
        'photo': 'photo',
        'signature': 'signature',
        'thumb': 'thumb',
        'thumbmark': 'thumb',
        'education': 'education',
        'csc': 'csc',
        'workcert': 'workcert',
        'certificate': 'certificate',
        'leave': 'leave'
      };
      
      // Helper function to construct full path (matches logic in resolvePathIdToFilePath)
      const constructFullPath = (mediapath, foldername, networkConfig) => {
        if (!mediapath || !foldername) return null;
        
        // If network share is enabled, construct network path
        if (networkConfig && networkConfig.is_enabled) {
          // Check if running in Docker
          const isDocker = process.env.DOCKER_CONTAINER === 'true' || 
                          (fs.existsSync && fs.existsSync('/.dockerenv')) ||
                          process.cwd().startsWith('/app');
          
          if (process.platform === 'win32' && !isDocker) {
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
              return `\\\\${networkConfig.server_ip}\\${networkConfig.share_name}\\${sharePath}`;
            } else {
              return `\\\\${networkConfig.server_ip}\\${networkConfig.share_name}`;
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
              return `${mountPoint}/${sharePath}`;
            } else {
              return mountPoint;
            }
          }
        } else {
          // No network share: use local path
          // If mediapath is relative, make it absolute
          if (path.isAbsolute(mediapath)) {
            return path.join(mediapath, foldername);
          } else {
            // Relative path - construct from base directory
            return path.join(DEFAULT_BASE_DIR, mediapath, foldername);
          }
        }
      };
      
      rows.forEach(row => {
        const foldername = (row.foldername || '').toLowerCase();
        const mediaType = folderTypeMap[foldername];
        
        if (mediaType && row.mediapath) {
          // Construct full path using network share settings if enabled
          const fullPath = constructFullPath(row.mediapath, foldername, networkConfig);
          
          if (fullPath) {
            MEDIA_DIRECTORIES[mediaType] = fullPath;
            MEDIA_PATH_IDS[mediaType] = row.pathid;
            console.log(`   ✅ Mapped ${foldername} (pathid: ${row.pathid}) → ${mediaType}`);
            console.log(`      Path: ${fullPath}`);
          } else {
            console.log(`   ⚠️ Skipped folder: ${foldername} - could not construct path`);
          }
        } else {
          console.log(`   ⚠️ Skipped folder: ${foldername} (mediaType: ${mediaType || 'not mapped'}, has mediapath: ${!!row.mediapath})`);
        }
      });
      
      console.log('✅ Loaded media paths from database');
      console.log(`   Found ${rows.length} folder(s) in database`);
      console.log(`   Active directories: ${Object.keys(MEDIA_DIRECTORIES).join(', ') || 'NONE'}`);
      console.log(`   Active pathids: ${JSON.stringify(MEDIA_PATH_IDS)}`);
      
      // Check if required folders are missing
      const requiredFolders = ['photo', 'signature', 'thumb'];
      const missingFolders = requiredFolders.filter(folder => !MEDIA_PATH_IDS[folder]);
      if (missingFolders.length > 0) {
        console.warn(`⚠️ Missing required folders: ${missingFolders.join(', ')}`);
        console.warn(`⚠️ Please configure these folders in Media Storage component`);
      }
    } else {
      console.log('⚠️ No media_path records found, using defaults');
      updateMediaDirectories();
    }
  } catch (error) {
    console.error('❌ Error loading media paths, using defaults:', error.message);
    updateMediaDirectories();
  }
}

// Refresh paths after configuration update
export async function refreshMediaPaths() {
  await initMediaPaths();
}

// Update MEDIA_DIRECTORIES based on MEDIA_PATHS (fallback for legacy)
function updateMediaDirectories() {
  // Use the complete paths directly from database, or fallback to default construction
  // NOTE: This function sets default paths but does NOT set pathids
  // Pathids MUST come from the media_path table
  if (Object.keys(MEDIA_DIRECTORIES).length === 0) {
    console.warn('⚠️ No media directories configured, using defaults (WILL NOT WORK FOR SAVING FILES)');
    console.warn('⚠️ Please configure folders in Media Storage component');
    MEDIA_DIRECTORIES = {
      signature: MEDIA_PATHS.signaturepath || path.join(DEFAULT_BASE_DIR, 'signature'),
      photo: MEDIA_PATHS.photopath || path.join(DEFAULT_BASE_DIR, 'photo'),
      thumb: MEDIA_PATHS.thumbpath || path.join(DEFAULT_BASE_DIR, 'thumb'),
      education: MEDIA_PATHS.educationpath || path.join(DEFAULT_BASE_DIR, 'education'),
      csc: MEDIA_PATHS.cscpath || path.join(DEFAULT_BASE_DIR, 'csc'),
      workcert: MEDIA_PATHS.workcertpath || path.join(DEFAULT_BASE_DIR, 'workcert'),
      certificate: MEDIA_PATHS.certificatepath || path.join(DEFAULT_BASE_DIR, 'certificate'),
      leave: MEDIA_PATHS.leavepath || path.join(DEFAULT_BASE_DIR, 'leave')
    };
    // IMPORTANT: Do NOT set pathids here - they must come from media_path table
    // MEDIA_PATH_IDS remains empty, which will cause saveMediaFile to fail with a clear error
  }
}

// Get directory for specific media type
export function getMediaDirectory(type) {
  if (!MEDIA_DIRECTORIES[type]) {
    throw new Error(`Invalid media type: ${type}`);
  }
  return MEDIA_DIRECTORIES[type];
}

// Get file extension for media type
export function getMediaExtension(type) {
  const extensions = {
    signature: 'png',
    photo: 'jpg',
    thumb: 'png',
    education: 'pdf',
    csc: 'pdf',
    workcert: 'pdf',
    certificate: 'pdf',
    leave: 'pdf'
  };
  return extensions[type] || 'jpg';
}

// Generate filename for media
export function generateMediaFilename(employeeObjId, type) {
  const extension = getMediaExtension(type);
  return `${employeeObjId}.${extension}`;
}

// Generate relative path
export function generateMediaRelativePath(employeeObjId, type) {
  const filename = generateMediaFilename(employeeObjId, type);
  return path.join('uploads', type, filename);
}

// Get MIME type
export function getMimeType(extension) {
  switch (extension.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.bmp':
      return 'image/bmp';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

// Get supported media types
export function getSupportedMediaTypes() {
  return Object.keys(MEDIA_DIRECTORIES);
}

/**
 * Get pathid for a media type
 * @param {string} type - Media type (photo, signature, thumb, etc.)
 * @returns {number|null} - pathid from media_path table, or null if not found
 */
export function getMediaPathId(type) {
  return MEDIA_PATH_IDS[type] || null;
}
