/**
 * Migration script to convert old file path format to pathid format
 * 
 * This script:
 * 1. Finds all employees_media records with old format paths (strings)
 * 2. Matches them to media_path records based on folder name
 * 3. Updates employees_media to use pathid instead
 */

import { getHR201Pool } from '../config/hr201Database.js';

async function migrateToPathId() {
  const pool = getHR201Pool();
  
  try {
    console.log('🔄 Starting migration from file paths to pathid format...');
    
    // Get all media_path records
    const [mediaPaths] = await pool.execute('SELECT pathid, foldername, mediapath FROM media_path');
    
    if (mediaPaths.length === 0) {
      console.log('⚠️ No media_path records found. Please configure folders first.');
      return;
    }
    
    console.log(`📁 Found ${mediaPaths.length} media_path records:`);
    mediaPaths.forEach(mp => {
      console.log(`   pathid=${mp.pathid}, foldername="${mp.foldername}", mediapath="${mp.mediapath}"`);
    });
    
    // Create mapping: foldername -> pathid
    const folderToPathId = {};
    mediaPaths.forEach(mp => {
      const folderName = (mp.foldername || '').toLowerCase();
      folderToPathId[folderName] = mp.pathid;
      // Also map 'thumbmark' to 'thumb'
      if (folderName === 'thumbmark') {
        folderToPathId['thumb'] = mp.pathid;
      }
    });
    
    console.log('📋 Folder to pathid mapping:', folderToPathId);
    
    // Get all employees_media records
    const [employeesMedia] = await pool.execute(`
      SELECT objid, emp_objid, signature_path, photo_path, thumb_path 
      FROM employees_media
      WHERE signature_path IS NOT NULL OR photo_path IS NOT NULL OR thumb_path IS NOT NULL
    `);
    
    console.log(`📊 Found ${employeesMedia.length} employees_media records to check`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const record of employeesMedia) {
      try {
        const updates = [];
        const values = [];
        
        // Check signature_path
        if (record.signature_path) {
          const isPathId = typeof record.signature_path === 'number' || 
                          (typeof record.signature_path === 'string' && /^\d+$/.test(record.signature_path));
          
          if (!isPathId) {
            // It's a file path, try to find matching pathid
            const pathStr = String(record.signature_path).toLowerCase();
            let pathid = null;
            
            // Check if path contains "signature"
            if (pathStr.includes('signature')) {
              pathid = folderToPathId['signature'];
            }
            
            if (pathid) {
              updates.push('signature_path = ?');
              values.push(pathid);
              console.log(`   ✅ Converting signature_path: "${record.signature_path}" → ${pathid}`);
            } else {
              console.log(`   ⚠️ Could not find pathid for signature_path: "${record.signature_path}"`);
            }
          }
        }
        
        // Check photo_path
        if (record.photo_path) {
          const isPathId = typeof record.photo_path === 'number' || 
                          (typeof record.photo_path === 'string' && /^\d+$/.test(record.photo_path));
          
          if (!isPathId) {
            // It's a file path, try to find matching pathid
            const pathStr = String(record.photo_path).toLowerCase();
            let pathid = null;
            
            // Check if path contains "photo"
            if (pathStr.includes('photo')) {
              pathid = folderToPathId['photo'];
            }
            
            if (pathid) {
              updates.push('photo_path = ?');
              values.push(pathid);
              console.log(`   ✅ Converting photo_path: "${record.photo_path}" → ${pathid}`);
            } else {
              console.log(`   ⚠️ Could not find pathid for photo_path: "${record.photo_path}"`);
            }
          }
        }
        
        // Check thumb_path
        if (record.thumb_path) {
          const isPathId = typeof record.thumb_path === 'number' || 
                          (typeof record.thumb_path === 'string' && /^\d+$/.test(record.thumb_path));
          
          if (!isPathId) {
            // It's a file path, try to find matching pathid
            const pathStr = String(record.thumb_path).toLowerCase();
            let pathid = null;
            
            // Check if path contains "thumb" or "thumbmark"
            if (pathStr.includes('thumb')) {
              pathid = folderToPathId['thumb'] || folderToPathId['thumbmark'];
            }
            
            if (pathid) {
              updates.push('thumb_path = ?');
              values.push(pathid);
              console.log(`   ✅ Converting thumb_path: "${record.thumb_path}" → ${pathid}`);
            } else {
              console.log(`   ⚠️ Could not find pathid for thumb_path: "${record.thumb_path}"`);
            }
          }
        }
        
        if (updates.length > 0) {
          values.push(record.objid);
          await pool.execute(`
            UPDATE employees_media 
            SET ${updates.join(', ')}, updated_at = NOW()
            WHERE objid = ?
          `, values);
          updatedCount++;
          console.log(`✅ Updated record for emp_objid: ${record.emp_objid}`);
        } else {
          skippedCount++;
          console.log(`⏭️ Skipped record for emp_objid: ${record.emp_objid} (already using pathid or no match found)`);
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error processing record ${record.objid}:`, error.message);
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Updated: ${updatedCount} records`);
    console.log(`   ⏭️ Skipped: ${skippedCount} records`);
    console.log(`   ❌ Errors: ${errorCount} records`);
    console.log('\n✅ Migration completed!');
    
  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateToPathId()
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

export default migrateToPathId;

