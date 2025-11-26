import { getHR201Pool } from '../config/hr201Database.js';
import { saveMediaFile } from '../utils/fileStorage.js';

async function migrateBlobToFiles() {
  const pool = getHR201Pool();
  
  try {
    console.log('🔄 Starting BLOB to filesystem migration...');
    
    // Get all records with BLOB data
    const [records] = await pool.execute(`
      SELECT objid, emp_objid, signature, photo, thumb
      FROM employees_media
      WHERE signature IS NOT NULL OR photo IS NOT NULL OR thumb IS NOT NULL
    `);

    console.log(`📊 Found ${records.length} records to migrate`);

    let migratedCount = 0;
    let errorCount = 0;

    for (const record of records) {
      try {
        const updates = [];
        const values = [];

        if (record.signature) {
          const path = await saveMediaFile(record.signature, 'signature', record.emp_objid);
          updates.push('signature_path = ?');
          values.push(path);
          console.log(`✅ Migrated signature for ${record.emp_objid}`);
        }

        if (record.photo) {
          const path = await saveMediaFile(record.photo, 'photo', record.emp_objid);
          updates.push('photo_path = ?');
          values.push(path);
          console.log(`✅ Migrated photo for ${record.emp_objid}`);
        }

        if (record.thumb) {
          const path = await saveMediaFile(record.thumb, 'thumb', record.emp_objid);
          updates.push('thumb_path = ?');
          values.push(path);
          console.log(`✅ Migrated thumb for ${record.emp_objid}`);
        }

        if (updates.length > 0) {
          values.push(record.objid);
          await pool.execute(`
            UPDATE employees_media 
            SET ${updates.join(', ')}, updated_at = NOW()
            WHERE objid = ?
          `, values);
          migratedCount++;
          console.log(`✅ Successfully migrated record: ${record.emp_objid}`);
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error migrating record ${record.emp_objid}:`, error.message);
      }
    }

    console.log(`\n🎉 Migration complete!`);
    console.log(`✅ Successfully migrated: ${migratedCount} records`);
    console.log(`❌ Errors: ${errorCount} records`);
    
    if (migratedCount > 0) {
      console.log(`\n📝 Next steps:`);
      console.log(`1. Test the application to ensure files are loading correctly`);
      console.log(`2. Verify files exist in C:\\HRIS\\backend\\uploads\\`);
      console.log(`3. Once confirmed working, you can drop the BLOB columns:`);
      console.log(`   ALTER TABLE employees_media DROP COLUMN signature;`);
      console.log(`   ALTER TABLE employees_media DROP COLUMN photo;`);
      console.log(`   ALTER TABLE employees_media DROP COLUMN thumb;`);
    }
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await pool.end();
  }
}

// Run migration if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateBlobToFiles();
}

export default migrateBlobToFiles;
