const sql = require('mssql');
const { getDb } = require('../config/db');

// Get kiosk configuration
exports.getKioskConfig = async (req, res) => {
  try {
    const pool = getDb();
    
    // Get configuration from database or return default
    const result = await pool.request()
      .query(`
        SELECT * FROM KIOSK_CONFIG 
        WHERE CONFIG_TYPE = 'biometric_devices'
      `);
    
    let config = {
      dtrCheckerDevice: null,
      loginBioDevice: null,
      enableDigitalPersona: true,
      enableNetworkMachines: true,
      autoDetectDevices: true
    };
    
    if (result.recordset.length > 0) {
      const dbConfig = result.recordset[0];
      try {
        config = JSON.parse(dbConfig.CONFIG_VALUE);
      } catch (e) {
        console.warn('Failed to parse kiosk config, using defaults');
      }
    }
    
    res.json({
      success: true,
      config: config
    });
  } catch (error) {
    console.error('Error getting kiosk config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load kiosk configuration',
      error: error.message
    });
  }
};

// Save kiosk configuration
exports.saveKioskConfig = async (req, res) => {
  try {
    const { config } = req.body;
    const pool = getDb();
    
    // Validate configuration
    if (!config) {
      return res.status(400).json({
        success: false,
        message: 'Configuration data is required'
      });
    }
    
    // Save to database
    await pool.request()
      .input('configType', sql.VarChar(50), 'biometric_devices')
      .input('configValue', sql.Text, JSON.stringify(config))
      .query(`
        MERGE KIOSK_CONFIG AS target
        USING (SELECT @configType AS CONFIG_TYPE, @configValue AS CONFIG_VALUE) AS source
        ON target.CONFIG_TYPE = source.CONFIG_TYPE
        WHEN MATCHED THEN
          UPDATE SET CONFIG_VALUE = source.CONFIG_VALUE, UPDATED_AT = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (CONFIG_TYPE, CONFIG_VALUE, CREATED_AT, UPDATED_AT)
          VALUES (source.CONFIG_TYPE, source.CONFIG_VALUE, GETDATE(), GETDATE());
      `);
    
    res.json({
      success: true,
      message: 'Kiosk configuration saved successfully'
    });
  } catch (error) {
    console.error('Error saving kiosk config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save kiosk configuration',
      error: error.message
    });
  }
};

// Test network machine connection
exports.testNetworkMachine = async (req, res) => {
  try {
    const { machineId } = req.body;
    const pool = getDb();
    
    // Get machine details
    const machineResult = await pool.request()
      .input('machineId', sql.Int, machineId)
      .query(`
        SELECT * FROM MACHINES 
        WHERE ID = @machineId
      `);
    
    if (machineResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found'
      });
    }
    
    const machine = machineResult.recordset[0];
    
    // Test connection (simplified - you might want to implement actual network test)
    const isConnected = await testMachineConnection(machine);
    
    res.json({
      success: isConnected,
      message: isConnected ? 'Connection test successful' : 'Connection test failed',
      machine: {
        id: machine.ID,
        name: machine.NAME,
        ip_address: machine.IP_ADDRESS,
        status: isConnected ? 'online' : 'offline'
      }
    });
  } catch (error) {
    console.error('Error testing network machine:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test machine connection',
      error: error.message
    });
  }
};

// Helper function to test machine connection
async function testMachineConnection(machine) {
  try {
    // This is a simplified test - you might want to implement actual network connectivity test
    // For now, we'll just check if the machine exists and has an IP address
    return !!(machine.IP_ADDRESS && machine.IP_ADDRESS.trim() !== '');
  } catch (error) {
    console.error('Machine connection test error:', error);
    return false;
  }
}

// Get network machines for kiosk
exports.getNetworkMachines = async (req, res) => {
  try {
    const pool = getDb();
    
    const result = await pool.request()
      .query(`
        SELECT ID, NAME, IP_ADDRESS, MACHINE_TYPE, STATUS, LAST_SEEN
        FROM MACHINES 
        WHERE STATUS = 'active' OR STATUS = 'online'
        ORDER BY NAME
      `);
    
    res.json({
      success: true,
      machines: result.recordset
    });
  } catch (error) {
    console.error('Error getting network machines:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get network machines',
      error: error.message
    });
  }
};
