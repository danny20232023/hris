import { getHR201Pool, initHR201Database } from '../config/hr201Database.js';

const civilStatuses = [
  'Single',
  'Married', 
  'Widowed',
  'Divorced',
  'Separated'
];

async function populateCivilStatus() {
  try {
    // Initialize database connection
    await initHR201Database();
    const pool = getHR201Pool();
    
    console.log('🔄 Populating civilstatus table...');
    
    // Check if table has data
    const [existing] = await pool.execute('SELECT COUNT(*) as count FROM civilstatus');
    console.log(`📊 Current records in civilstatus: ${existing[0].count}`);
    
    if (existing[0].count > 0) {
      console.log('✅ civilstatus table already has data');
      return;
    }
    
    // Insert civil statuses
    for (const status of civilStatuses) {
      await pool.execute(
        'INSERT INTO civilstatus (civil_status) VALUES (?)',
        [status]
      );
      console.log(`✅ Inserted: ${status}`);
    }
    
    console.log('🎉 Successfully populated civilstatus table');
    
  } catch (error) {
    console.error('❌ Error populating civilstatus:', error);
  }
}

populateCivilStatus();
