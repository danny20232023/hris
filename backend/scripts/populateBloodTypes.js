import { getHR201Pool, initHR201Database } from '../config/hr201Database.js';

const bloodTypes = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-'
];

async function populateBloodTypes() {
  try {
    // Initialize database connection
    await initHR201Database();
    const pool = getHR201Pool();
    
    console.log('🔄 Populating blood_types table...');
    
    // Check if table has data
    const [existing] = await pool.execute('SELECT COUNT(*) as count FROM blood_types');
    console.log(`📊 Current records in blood_types: ${existing[0].count}`);
    
    if (existing[0].count > 0) {
      console.log('✅ blood_types table already has data');
      return;
    }
    
    // Insert blood types
    for (const bloodType of bloodTypes) {
      await pool.execute(
        'INSERT INTO blood_types (blood_type) VALUES (?)',
        [bloodType]
      );
      console.log(`✅ Inserted: ${bloodType}`);
    }
    
    console.log('🎉 Successfully populated blood_types table');
    
  } catch (error) {
    console.error('❌ Error populating blood_types:', error);
  }
}

populateBloodTypes();
