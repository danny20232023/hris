import { initHR201Database, getHR201Pool } from '../config/hr201Database.js';

async function setupMediaPathTable() {
  try {
    console.log('🔧 Setting up media_path table...');
    
    // Initialize database connection
    await initHR201Database();
    const pool = getHR201Pool();
    
    // Check if table exists
    const [tables] = await pool.execute("SHOW TABLES LIKE 'media_path'");
    
    if (tables.length === 0) {
      console.log('📋 Creating media_path table...');
      
      // Create the table
      await pool.execute(`
        CREATE TABLE media_path (
          pathid INT AUTO_INCREMENT PRIMARY KEY,
          photopath TEXT,
          signaturepath TEXT,
          thumbpath TEXT,
          educationpath TEXT,
          cscpath TEXT,
          workcertpath TEXT,
          certificatepath TEXT,
          leavepath TEXT
        )
      `);
      
      console.log('✅ media_path table created successfully');
    } else {
      console.log('✅ media_path table already exists');
      
      // Check the structure
      const [columns] = await pool.execute('DESCRIBE media_path');
      console.log('📋 Table structure:');
      columns.forEach(col => {
        console.log(`  - ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'} ${col.Key === 'PRI' ? 'PRIMARY KEY' : ''}`);
      });
      
      // Check if there are multiple records and clean up if needed
      const [records] = await pool.execute('SELECT COUNT(*) as count FROM media_path');
      const recordCount = records[0].count;
      
      if (recordCount > 1) {
        console.log(`⚠️ Found ${recordCount} records in media_path table. Cleaning up to keep only the latest one...`);
        
        // Keep only the most recent record
        await pool.execute(`
          DELETE FROM media_path 
          WHERE pathid NOT IN (
            SELECT pathid FROM (
              SELECT pathid FROM media_path 
              ORDER BY pathid DESC 
              LIMIT 1
            ) AS latest
          )
        `);
        
        console.log('✅ Cleaned up duplicate records. Only one record remains.');
      } else if (recordCount === 1) {
        console.log('✅ Table has exactly one record as expected.');
      } else {
        console.log('ℹ️ Table is empty. A record will be created when configuration is first saved.');
      }
    }
    
    console.log('🎉 Setup complete!');
    
  } catch (error) {
    console.error('❌ Error setting up media_path table:', error);
  } finally {
    process.exit(0);
  }
}

setupMediaPathTable();
