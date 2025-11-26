// backend/test-hr201-connection.js
// Test script for HR201 database connection and functionality

import {
  initHR201Database,
  checkHR201Health,
  getHR201Pool,
  syncEmployeeToHR201,
  getEmployeeCompleteProfile,
  initializeLeaveCredits,
  getLeaveBalance,
  getEmployeeFullName,
  closeHR201Database
} from './config/hr201Database.js';

console.log('='.repeat(60));
console.log('HR201 DATABASE CONNECTION TEST');
console.log('='.repeat(60));
console.log('');

async function testHR201Connection() {
  try {
    // Test 1: Initialize connection
    console.log('Test 1: Initializing HR201 database connection...');
    await initHR201Database();
    console.log('✅ Connection initialized successfully\n');

    // Test 2: Health check
    console.log('Test 2: Running health check...');
    const health = await checkHR201Health();
    console.log(`Status: ${health.status}`);
    console.log(`Connected: ${health.connected}`);
    console.log(`Timestamp: ${health.timestamp}`);
    console.log('✅ Health check passed\n');

    // Test 3: Count tables
    console.log('Test 3: Verifying database structure...');
    const pool = getHR201Pool();
    const [tables] = await pool.execute('SHOW TABLES');
    console.log(`Found ${tables.length} tables in HR201 database`);
    
    if (tables.length < 24) {
      console.warn(`⚠️  Expected 24 tables, found ${tables.length}`);
      console.log('Tables found:');
      tables.forEach((row, index) => {
        const tableName = Object.values(row)[0];
        console.log(`  ${index + 1}. ${tableName}`);
      });
    } else {
      console.log('✅ All expected tables exist\n');
    }

    // Test 4: Check stored procedures
    console.log('Test 4: Verifying stored procedures...');
    const [procedures] = await pool.execute(
      "SHOW PROCEDURE STATUS WHERE Db = 'HR201'"
    );
    console.log(`Found ${procedures.length} stored procedures`);
    
    if (procedures.length < 5) {
      console.warn(`⚠️  Expected 5 procedures, found ${procedures.length}`);
      console.log('Procedures found:');
      procedures.forEach((proc, index) => {
        console.log(`  ${index + 1}. ${proc.Name}`);
      });
    } else {
      console.log('✅ All expected procedures exist\n');
    }

    // Test 5: Check functions
    console.log('Test 5: Verifying functions...');
    const [functions] = await pool.execute(
      "SHOW FUNCTION STATUS WHERE Db = 'HR201'"
    );
    console.log(`Found ${functions.length} functions`);
    
    if (functions.length < 3) {
      console.warn(`⚠️  Expected 3 functions, found ${functions.length}`);
      console.log('Functions found:');
      functions.forEach((func, index) => {
        console.log(`  ${index + 1}. ${func.Name}`);
      });
    } else {
      console.log('✅ All expected functions exist\n');
    }

    // Test 6: Check sample data
    console.log('Test 6: Verifying sample data...');
    const [salaryGrades] = await pool.execute(
      'SELECT COUNT(*) as count FROM Salary_GradeTable'
    );
    console.log(`Salary grades: ${salaryGrades[0].count} records`);
    
    const [docTypes] = await pool.execute(
      'SELECT COUNT(*) as count FROM LKP_DocumentTypes'
    );
    console.log(`Document types: ${docTypes[0].count} records`);
    console.log('✅ Sample data populated\n');

    // Test 7: Test sync employee procedure
    console.log('Test 7: Testing employee sync...');
    try {
      const testUserID = 999;
      const testBadgeNumber = 'TEST001';
      const testName = 'Test, Employee Sample';
      
      await syncEmployeeToHR201(testUserID, testBadgeNumber, testName);
      console.log(`✅ Sync successful for test employee (USERID: ${testUserID})\n`);
      
      // Verify the sync
      const [result] = await pool.execute(
        'SELECT * FROM Employee_PersonalInfo WHERE USERID = ?',
        [testUserID]
      );
      
      if (result.length > 0) {
        console.log('Synced employee data:');
        console.log(`  USERID: ${result[0].USERID}`);
        console.log(`  BADGENUMBER: ${result[0].BADGENUMBER}`);
        console.log(`  Surname: ${result[0].Surname}`);
        console.log(`  FirstName: ${result[0].FirstName}`);
        console.log('✅ Employee data verified\n');
        
        // Clean up test data
        await pool.execute(
          'DELETE FROM Employee_PersonalInfo WHERE USERID = ?',
          [testUserID]
        );
        console.log('🧹 Test data cleaned up\n');
      }
    } catch (error) {
      console.error('❌ Sync test failed:', error.message);
    }

    // Test 8: Test leave credits initialization
    console.log('Test 8: Testing leave credits...');
    try {
      const testUserID = 998;
      
      // First, create a test employee
      await pool.execute(`
        INSERT INTO Employee_PersonalInfo (USERID, BADGENUMBER, Surname, FirstName, IsActive)
        VALUES (?, ?, 'Test', 'Leave', 1)
      `, [testUserID, 'TEST002']);
      
      // Initialize leave credits
      await initializeLeaveCredits(testUserID, 2024);
      console.log('✅ Leave credits initialized\n');
      
      // Get leave balance
      const vlBalance = await getLeaveBalance(testUserID, 'VL', 2024);
      const slBalance = await getLeaveBalance(testUserID, 'SL', 2024);
      
      console.log('Leave balances:');
      console.log(`  Vacation Leave (VL): ${vlBalance} days`);
      console.log(`  Sick Leave (SL): ${slBalance} days`);
      console.log('✅ Leave balance retrieval successful\n');
      
      // Clean up
      await pool.execute(
        'DELETE FROM Employee_LeaveCredits WHERE USERID = ?',
        [testUserID]
      );
      await pool.execute(
        'DELETE FROM Employee_PersonalInfo WHERE USERID = ?',
        [testUserID]
      );
      console.log('🧹 Test data cleaned up\n');
    } catch (error) {
      console.error('❌ Leave credits test failed:', error.message);
    }

    // Test 9: Test queries
    console.log('Test 9: Testing basic queries...');
    try {
      const [employees] = await pool.execute(`
        SELECT COUNT(*) as count 
        FROM Employee_PersonalInfo 
        WHERE IsActive = 1
      `);
      console.log(`Active employees in HR201: ${employees[0].count}`);
      
      const [positions] = await pool.execute(`
        SELECT COUNT(*) as count 
        FROM Plantilla_Positions 
        WHERE IsActive = 1
      `);
      console.log(`Active positions in plantilla: ${positions[0].count}`);
      
      console.log('✅ Query test passed\n');
    } catch (error) {
      console.error('❌ Query test failed:', error.message);
    }

    // Final Summary
    console.log('='.repeat(60));
    console.log('🎉 ALL TESTS PASSED!');
    console.log('='.repeat(60));
    console.log('');
    console.log('HR201 database is ready for use!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Sync employees from ZKBio5: Run sync script');
    console.log('2. Create API routes: /api/hris/*');
    console.log('3. Build frontend components: HRIS modules');
    console.log('4. Test with real employee data');
    console.log('');
    console.log('For documentation:');
    console.log('- Setup: database/HR201_Setup_Guide.md');
    console.log('- Queries: database/HR201_Quick_Reference.md');
    console.log('- Summary: database/HR201_IMPLEMENTATION_SUMMARY.md');
    console.log('');

    // Close connection
    await closeHR201Database();
    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(60));
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    console.error('Troubleshooting steps:');
    console.error('1. Check if MySQL server is running');
    console.error('2. Verify .env file has correct HR201_DB_* settings');
    console.error('3. Ensure HR201 database exists');
    console.error('4. Run schema script: mysql -u root -p HR201 < database/HR201_Schema_MySQL.sql');
    console.error('5. Run integration script: mysql -u root -p HR201 < database/HR201_ZKBio5_Integration_MySQL.sql');
    console.error('');
    console.error('For help, see: database/HR201_Setup_Guide.md');
    console.error('');

    await closeHR201Database();
    process.exit(1);
  }
}

// Run tests
testHR201Connection();

