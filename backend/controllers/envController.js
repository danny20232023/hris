import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import mysql from 'mysql2/promise';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get .env file path
const getEnvPath = () => {
  const backendEnvPath = path.join(__dirname, '..', '.env');
  const rootEnvPath = path.join(__dirname, '..', '..', '.env');
  
  if (fs.existsSync(backendEnvPath)) {
    return backendEnvPath;
  } else if (fs.existsSync(rootEnvPath)) {
    return rootEnvPath;
  } else {
    return backendEnvPath;
  }
};

// Detect deployment environment
const detectDeploymentEnvironment = async () => {
  const info = {
    environment: process.env.NODE_ENV || 'development',
    processManager: 'none',
    hasPM2: false,
    hasNodemon: false,
    hasDocker: false,
    hasSystemd: false
  };

  try {
    // Check for PM2
    try {
      await execAsync('pm2 --version');
      info.hasPM2 = true;
      info.processManager = 'pm2';
    } catch (e) {
      // PM2 not available
    }

    // Check for nodemon (development)
    if (process.env.npm_lifecycle_event === 'dev' || process.argv.includes('nodemon')) {
      info.hasNodemon = true;
      if (!info.hasPM2) {
        info.processManager = 'nodemon';
      }
    }

    // Check for Docker
    if (fs.existsSync('/.dockerenv') || process.env.DOCKER_CONTAINER) {
      info.hasDocker = true;
      info.processManager = 'docker';
    }

    // Check for systemd
    if (process.env.SYSTEMD_EXEC_PID) {
      info.hasSystemd = true;
      info.processManager = 'systemd';
    }

  } catch (error) {
    console.log('Error detecting deployment environment:', error.message);
  }

  return info;
};

// Parse .env file content
const parseEnvFile = (content) => {
  const variables = {};
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      return;
    }
    
    const equalIndex = trimmedLine.indexOf('=');
    if (equalIndex > 0) {
      const key = trimmedLine.substring(0, equalIndex).trim();
      const value = trimmedLine.substring(equalIndex + 1).trim();
      const cleanValue = value.replace(/^["']|["']$/g, '');
      
      variables[key] = {
        value: cleanValue,
        lineNumber: index + 1,
        originalLine: line
      };
    }
  });
  
  return variables;
};

// Convert variables back to .env format
const formatEnvFile = (variables, originalContent) => {
  const lines = originalContent.split('\n');
  const result = [];
  
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      result.push(line);
      return;
    }
    
    const equalIndex = trimmedLine.indexOf('=');
    if (equalIndex > 0) {
      const key = trimmedLine.substring(0, equalIndex).trim();
      
      if (variables[key]) {
        const newValue = variables[key].value;
        const originalValue = trimmedLine.substring(equalIndex + 1);
        const hasQuotes = originalValue.startsWith('"') || originalValue.startsWith("'");
        
        if (hasQuotes) {
          const quote = originalValue.startsWith('"') ? '"' : "'";
          result.push(`${key}=${quote}${newValue}${quote}`);
        } else {
          result.push(`${key}=${newValue}`);
        }
      } else {
        result.push(line);
      }
    } else {
      result.push(line);
    }
  });
  
  return result.join('\n');
};

// GET /api/env - Get all environment variables
export const getEnvVariables = async (req, res) => {
  try {
    const envPath = getEnvPath();
    
    if (!fs.existsSync(envPath)) {
      return res.json({
        success: true,
        data: {},
        message: 'No .env file found'
      });
    }
    
    const content = fs.readFileSync(envPath, 'utf8');
    const variables = parseEnvFile(content);
    
    res.json({
      success: true,
      data: variables,
      filePath: envPath
    });
  } catch (error) {
    console.error('Error reading .env file:', error);
    res.status(500).json({
      success: false,
      message: 'Error reading .env file',
      error: error.message
    });
  }
};

// GET /api/env/deployment-info - Get deployment environment info
export const getDeploymentInfo = async (req, res) => {
  try {
    const info = await detectDeploymentEnvironment();
    res.json({
      success: true,
      ...info
    });
  } catch (error) {
    console.error('Error getting deployment info:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting deployment info',
      error: error.message
    });
  }
};

// PUT /api/env - Update environment variables
export const updateEnvVariables = async (req, res) => {
  try {
    const { variables } = req.body;
    const envPath = getEnvPath();
    
    let originalContent = '';
    if (fs.existsSync(envPath)) {
      originalContent = fs.readFileSync(envPath, 'utf8');
    }
    
    const updatedContent = formatEnvFile(variables, originalContent);
    fs.writeFileSync(envPath, updatedContent, 'utf8');
    
    res.json({
      success: true,
      message: 'Environment variables updated successfully',
      filePath: envPath
    });
  } catch (error) {
    console.error('Error updating .env file:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating .env file',
      error: error.message
    });
  }
};

// POST /api/env/restart - Smart restart based on deployment environment
export const restartServer = async (req, res) => {
  try {
    console.log('🔄 Environment variables changed, initiating smart restart...');
    
    const deploymentInfo = await detectDeploymentEnvironment();
    console.log('📊 Deployment info:', deploymentInfo);
    
    // Send response immediately
    res.json({
      success: true,
      message: 'Server restart initiated successfully',
      deploymentInfo,
      timestamp: new Date().toISOString()
    });
    
    // Give time for response to be sent
    setTimeout(async () => {
      try {
        let restartCommand = null;
        
        if (deploymentInfo.hasPM2) {
          // Production with PM2
          restartCommand = 'pm2 restart dtr-checker-backend';
          console.log('🚀 Restarting with PM2...');
        } else if (deploymentInfo.hasDocker) {
          // Docker environment
          restartCommand = 'docker-compose restart backend';
          console.log('🐳 Restarting Docker container...');
        } else if (deploymentInfo.hasSystemd) {
          // Systemd service
          restartCommand = 'sudo systemctl restart dtr-checker-backend';
          console.log('⚙️ Restarting systemd service...');
        } else if (deploymentInfo.hasNodemon) {
          // Development with nodemon - create a restart trigger file
          const restartTriggerPath = path.join(__dirname, '..', 'restart.trigger');
          fs.writeFileSync(restartTriggerPath, Date.now().toString());
          console.log('🔄 Triggering nodemon restart...');
          // Also try direct nodemon restart
          restartCommand = 'npx nodemon --exec "node server.js"';
        } else {
          // Fallback: exit process
          console.log(' No process manager detected, exiting process...');
          process.exit(0);
        }
        
        if (restartCommand) {
          try {
            await execAsync(restartCommand);
            console.log('✅ Server restarted successfully');
          } catch (restartError) {
            console.error('❌ Restart command failed:', restartError);
            // Fallback to process exit
            process.exit(0);
          }
        }
        
      } catch (restartError) {
        console.error('❌ Error during restart process:', restartError);
        process.exit(0);
      }
    }, 1000);
    
  } catch (error) {
    console.error('Error initiating server restart:', error);
    res.status(500).json({
      success: false,
      message: 'Error initiating server restart',
      error: error.message
    });
  }
};

// POST /api/env/restart-all - Restart both backend and frontend
export const restartAllServices = async (req, res) => {
  try {
    console.log('🔄 Restarting all services...');
    
    const deploymentInfo = await detectDeploymentEnvironment();
    
    res.json({
      success: true,
      message: 'All services restart initiated successfully',
      deploymentInfo,
      timestamp: new Date().toISOString()
    });
    
    setTimeout(async () => {
      try {
        if (deploymentInfo.hasPM2) {
          // Restart both backend and frontend with PM2
          await execAsync('pm2 restart dtr-checker-backend dtr-checker-frontend');
          console.log('✅ All services restarted with PM2');
        } else if (deploymentInfo.hasDocker) {
          // Restart Docker services
          await execAsync('docker-compose restart');
          console.log('✅ All Docker services restarted');
        } else {
          // Development fallback
          console.log('🔄 Development mode: restarting backend only');
          process.exit(0);
        }
      } catch (restartError) {
        console.error('❌ Error during services restart:', restartError);
        process.exit(0);
      }
    }, 1000);
    
  } catch (error) {
    console.error('Error initiating services restart:', error);
    res.status(500).json({
      success: false,
      message: 'Error initiating services restart',
      error: error.message
    });
  }
};

// GET /api/env/db-201files - Get 201 Files DB configuration
export const get201FilesDBConfig = async (req, res) => {
  try {
    const config = {
      host: process.env.DB_201FILES_HOST || '',
      port: process.env.DB_201FILES_PORT || '3306',
      database: process.env.DB_201FILES_NAME || '',
      username: process.env.DB_201FILES_USER || '',
      password: process.env.DB_201FILES_PASSWORD ? '••••••••' : '', // Masked
      enabled: process.env.DB_201FILES_ENABLED === 'true',
      connectionStatus: null
    };

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error getting 201 Files DB config:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting configuration',
      error: error.message
    });
  }
};

// POST /api/env/db-201files/test - Test 201 Files DB connection
export const test201FilesDBConnection = async (req, res) => {
  try {
    const { host, port, database, username, password } = req.body;
    
    // Test connection
    const connection = await mysql.createConnection({
      host,
      port: parseInt(port),
      database,
      user: username,
      password
    });

    await connection.ping();
    await connection.end();

    res.json({
      success: true,
      message: 'Connection successful'
    });
  } catch (error) {
    console.error('201 Files DB connection test failed:', error);
    res.json({
      success: false,
      message: error.message || 'Connection failed'
    });
  }
};

// POST /api/env/db-201files/save - Save 201 Files DB configuration
export const save201FilesDBConfig = async (req, res) => {
  try {
    const { host, port, database, username, password, enabled } = req.body;
    const envPath = getEnvPath();
    
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }

    // Update or add variables
    const variables = parseEnvFile(content);
    variables['DB_201FILES_ENABLED'] = { value: enabled.toString() };
    variables['DB_201FILES_HOST'] = { value: host };
    variables['DB_201FILES_PORT'] = { value: port };
    variables['DB_201FILES_NAME'] = { value: database };
    variables['DB_201FILES_USER'] = { value: username };
    variables['DB_201FILES_PASSWORD'] = { value: password };

    // If variables don't exist in file, append them
    const existingKeys = Object.keys(parseEnvFile(content));
    const newVars = [
      'DB_201FILES_ENABLED',
      'DB_201FILES_HOST',
      'DB_201FILES_PORT',
      'DB_201FILES_NAME',
      'DB_201FILES_USER',
      'DB_201FILES_PASSWORD'
    ];

    let updatedContent = content;
    newVars.forEach(key => {
      if (!existingKeys.includes(key)) {
        updatedContent += `\n${key}=${variables[key].value}`;
      } else {
        // Replace existing value
        const regex = new RegExp(`^${key}=.*$`, 'm');
        updatedContent = updatedContent.replace(regex, `${key}=${variables[key].value}`);
      }
    });

    fs.writeFileSync(envPath, updatedContent, 'utf8');

    res.json({
      success: true,
      message: '201 Files database configuration saved successfully'
    });
  } catch (error) {
    console.error('Error saving 201 Files DB config:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving configuration',
      error: error.message
    });
  }
};

// GET /api/env/db-payroll - Get Payroll DB configuration
export const getPayrollDBConfig = async (req, res) => {
  try {
    const config = {
      host: process.env.DB_PAYROLL_HOST || '',
      port: process.env.DB_PAYROLL_PORT || '3306',
      database: process.env.DB_PAYROLL_NAME || '',
      username: process.env.DB_PAYROLL_USER || '',
      password: process.env.DB_PAYROLL_PASSWORD ? '••••••••' : '', // Masked
      enabled: process.env.DB_PAYROLL_ENABLED === 'true',
      connectionStatus: null
    };

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error getting Payroll DB config:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting configuration',
      error: error.message
    });
  }
};

// POST /api/env/db-payroll/test - Test Payroll DB connection
export const testPayrollDBConnection = async (req, res) => {
  try {
    const { host, port, database, username, password } = req.body;
    
    // Test connection
    const connection = await mysql.createConnection({
      host,
      port: parseInt(port),
      database,
      user: username,
      password
    });

    await connection.ping();
    await connection.end();

    res.json({
      success: true,
      message: 'Connection successful'
    });
  } catch (error) {
    console.error('Payroll DB connection test failed:', error);
    res.json({
      success: false,
      message: error.message || 'Connection failed'
    });
  }
};

// POST /api/env/db-payroll/save - Save Payroll DB configuration
export const savePayrollDBConfig = async (req, res) => {
  try {
    const { host, port, database, username, password, enabled } = req.body;
    const envPath = getEnvPath();
    
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }

    // Update or add variables
    const variables = parseEnvFile(content);
    variables['DB_PAYROLL_ENABLED'] = { value: enabled.toString() };
    variables['DB_PAYROLL_HOST'] = { value: host };
    variables['DB_PAYROLL_PORT'] = { value: port };
    variables['DB_PAYROLL_NAME'] = { value: database };
    variables['DB_PAYROLL_USER'] = { value: username };
    variables['DB_PAYROLL_PASSWORD'] = { value: password };

    // If variables don't exist in file, append them
    const existingKeys = Object.keys(parseEnvFile(content));
    const newVars = [
      'DB_PAYROLL_ENABLED',
      'DB_PAYROLL_HOST',
      'DB_PAYROLL_PORT',
      'DB_PAYROLL_NAME',
      'DB_PAYROLL_USER',
      'DB_PAYROLL_PASSWORD'
    ];

    let updatedContent = content;
    newVars.forEach(key => {
      if (!existingKeys.includes(key)) {
        updatedContent += `\n${key}=${variables[key].value}`;
      } else {
        // Replace existing value
        const regex = new RegExp(`^${key}=.*$`, 'm');
        updatedContent = updatedContent.replace(regex, `${key}=${variables[key].value}`);
      }
    });

    fs.writeFileSync(envPath, updatedContent, 'utf8');

    res.json({
      success: true,
      message: 'Payroll database configuration saved successfully'
    });
  } catch (error) {
    console.error('Error saving Payroll DB config:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving configuration',
      error: error.message
    });
  }
};