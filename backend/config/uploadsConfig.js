import path from 'path';
import { fileURLToPath } from 'url';
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

// Initialize media paths from database
export async function initMediaPaths() {
  try {
    const pool = getHR201Pool();
    const [rows] = await pool.execute('SELECT * FROM media_path LIMIT 1');
    
    if (rows.length > 0) {
      MEDIA_PATHS = rows[0];
      console.log('✅ Loaded media paths from database');
    } else {
      console.log('⚠️ No media_path record found, using defaults');
    }
    
    updateMediaDirectories();
  } catch (error) {
    console.error('❌ Error loading media paths, using defaults:', error.message);
    updateMediaDirectories();
  }
}

// Refresh paths after configuration update
export async function refreshMediaPaths() {
  await initMediaPaths();
}

// Update MEDIA_DIRECTORIES based on MEDIA_PATHS
function updateMediaDirectories() {
  // Use the complete paths directly from database, or fallback to default construction
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
