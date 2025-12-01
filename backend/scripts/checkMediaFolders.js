// Diagnostic script to check media folder configuration
import { initHR201Database } from '../config/hr201Database.js';
import { getHR201Pool } from '../config/hr201Database.js';
import { initMediaPaths, getMediaPathId, getMediaDirectory } from '../config/uploadsConfig.js';

async function checkMediaFolders() {
  try {
    console.log('🔍 Checking media folder configuration...\n');
    
    // Initialize database connection first
    console.log('🔄 Initializing HR201 database connection...');
    await initHR201Database();
    console.log('✅ Database connected\n');
    
    // Initialize paths
    await initMediaPaths();
    
    // Check database
    const pool = getHR201Pool();
    const [folders] = await pool.execute('SELECT * FROM media_path ORDER BY pathid');
    
    console.log(`📊 Database Status:`);
    console.log(`   Found ${folders.length} folder(s) in media_path table\n`);
    
    if (folders.length > 0) {
      console.log('📁 Folders in database:');
      folders.forEach(folder => {
        console.log(`   - pathid: ${folder.pathid}, foldername: "${folder.foldername}", folderfor: "${folder.folderfor}", mediapath: "${folder.mediapath}"`);
      });
      console.log('');
    }
    
    // Check loaded configuration
    console.log('⚙️  Loaded Configuration:');
    const types = ['photo', 'signature', 'thumb'];
    
    types.forEach(type => {
      const pathid = getMediaPathId(type);
      let directory = null;
      try {
        directory = getMediaDirectory(type);
      } catch (error) {
        directory = `ERROR: ${error.message}`;
      }
      
      if (pathid) {
        console.log(`   ✅ ${type}: pathid=${pathid}, directory="${directory}"`);
      } else {
        console.log(`   ❌ ${type}: NOT CONFIGURED (pathid=null, directory="${directory}")`);
      }
    });
    
    console.log('\n📝 Summary:');
    const missing = types.filter(type => !getMediaPathId(type));
    if (missing.length === 0) {
      console.log('   ✅ All required folders are configured!');
    } else {
      console.log(`   ❌ Missing folders: ${missing.join(', ')}`);
      console.log('   ⚠️  Please configure these folders in Media Storage component');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkMediaFolders();

