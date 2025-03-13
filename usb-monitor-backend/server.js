
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const usbDetect = require('node-usb-detection');

const app = express();
const port = 3001;

// Create HTTP server
const server = http.createServer(app);

// Setup WebSocket server
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());

// Data storage paths
const dataDir = path.join(__dirname, 'data');
const whitelistPath = path.join(dataDir, 'whitelist.json');
const blockedAttemptsPath = path.join(dataDir, 'blocked-attempts.json');
const logsPath = path.join(dataDir, 'logs.json');

// Create data directory if it doesn't exist
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize data files if they don't exist
const initializeDataFiles = () => {
  if (!fs.existsSync(whitelistPath)) {
    fs.writeFileSync(whitelistPath, JSON.stringify([]));
  }
  
  if (!fs.existsSync(blockedAttemptsPath)) {
    fs.writeFileSync(blockedAttemptsPath, JSON.stringify([]));
  }
  
  if (!fs.existsSync(logsPath)) {
    fs.writeFileSync(logsPath, JSON.stringify([]));
  }
};

initializeDataFiles();

// Helper functions for data operations
const readDataFile = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return [];
  }
};

const writeDataFile = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
    return false;
  }
};

// Broadcast updates to all connected clients
const broadcastUpdate = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

// API Endpoints
app.get('/api/usb-devices', (req, res) => {
  try {
    const whitelistedDevices = readDataFile(whitelistPath);
    const blockedAttempts = readDataFile(blockedAttemptsPath);
    const logs = readDataFile(logsPath);
    
    res.json({
      whitelistedDevices,
      blockedAttempts,
      logs
    });
  } catch (error) {
    console.error('Error retrieving USB devices:', error);
    res.status(500).json({ error: 'Failed to retrieve USB devices' });
  }
});

// Add device to whitelist
app.post('/api/whitelist', (req, res) => {
  try {
    const newDevice = req.body;
    const whitelistedDevices = readDataFile(whitelistPath);
    
    // Add a unique ID and status to the device
    const deviceWithId = {
      ...newDevice,
      id: Date.now(),
      status: 'allowed',
      date: new Date().toISOString()
    };
    
    // Add to whitelist
    whitelistedDevices.push(deviceWithId);
    writeDataFile(whitelistPath, whitelistedDevices);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      ...deviceWithId,
      action: 'Added to whitelist',
      id: Date.now() // Unique ID for log entry
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the update
    broadcastUpdate({
      whitelistUpdate: whitelistedDevices,
      newLog: logEntry
    });
    
    res.status(201).json(deviceWithId);
  } catch (error) {
    console.error('Error adding device to whitelist:', error);
    res.status(500).json({ error: 'Failed to add device to whitelist' });
  }
});

// Remove device from whitelist
app.delete('/api/whitelist/:id', (req, res) => {
  try {
    const deviceId = parseInt(req.params.id);
    let whitelistedDevices = readDataFile(whitelistPath);
    
    // Find the device to remove
    const deviceToRemove = whitelistedDevices.find(device => device.id === deviceId);
    
    if (!deviceToRemove) {
      return res.status(404).json({ error: 'Device not found in whitelist' });
    }
    
    // Remove from whitelist
    whitelistedDevices = whitelistedDevices.filter(device => device.id !== deviceId);
    writeDataFile(whitelistPath, whitelistedDevices);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      ...deviceToRemove,
      action: 'Removed from whitelist',
      status: 'blocked',
      id: Date.now() // Unique ID for log entry
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Add to blocked attempts if needed
    const blockedAttempts = readDataFile(blockedAttemptsPath);
    const blockedEntry = {
      ...deviceToRemove,
      status: 'blocked',
      date: new Date().toISOString(),
      id: Date.now() // Unique ID for blocked entry
    };
    blockedAttempts.unshift(blockedEntry);
    writeDataFile(blockedAttemptsPath, blockedAttempts);
    
    // Broadcast the update
    broadcastUpdate({
      whitelistUpdate: whitelistedDevices,
      newBlockedAttempt: blockedEntry,
      newLog: logEntry
    });
    
    res.json({ message: 'Device removed from whitelist successfully' });
  } catch (error) {
    console.error('Error removing device from whitelist:', error);
    res.status(500).json({ error: 'Failed to remove device from whitelist' });
  }
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  
  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
  });
});

// Initialize USB detection
const initUsbDetection = () => {
  usbDetect.startMonitoring();
  
  // Handle device add event
  usbDetect.on('add', (device) => {
    console.log('USB device connected:', device);
    
    const { vendorId, productId } = device;
    const whitelistedDevices = readDataFile(whitelistPath);
    
    // Check if device is whitelisted
    const isWhitelisted = whitelistedDevices.some(
      (d) => d.vendorId === String(vendorId) && d.productId === String(productId)
    );
    
    const logs = readDataFile(logsPath);
    const logEntry = {
      vendorId: String(vendorId),
      productId: String(productId),
      manufacturer: device.manufacturer || 'Unknown',
      username: 'system',
      date: new Date().toISOString(),
      id: Date.now(),
      status: isWhitelisted ? 'allowed' : 'blocked',
      action: isWhitelisted ? 'Device access allowed' : 'Device access blocked'
    };
    
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // If device is not in whitelist, add to blocked attempts
    if (!isWhitelisted) {
      const blockedAttempts = readDataFile(blockedAttemptsPath);
      const blockedEntry = {
        ...logEntry,
        id: Date.now() // Ensure unique ID
      };
      
      blockedAttempts.unshift(blockedEntry);
      writeDataFile(blockedAttemptsPath, blockedAttempts);
      
      // Broadcast the blocked attempt
      broadcastUpdate({
        newBlockedAttempt: blockedEntry,
        newLog: logEntry
      });
    } else {
      // Broadcast the log
      broadcastUpdate({
        newLog: logEntry
      });
    }
  });
  
  // Handle device remove event
  usbDetect.on('remove', (device) => {
    console.log('USB device disconnected:', device);
    
    const { vendorId, productId } = device;
    
    const logs = readDataFile(logsPath);
    const logEntry = {
      vendorId: String(vendorId),
      productId: String(productId),
      manufacturer: device.manufacturer || 'Unknown',
      username: 'system',
      date: new Date().toISOString(),
      id: Date.now(),
      status: 'info',
      action: 'Device disconnected'
    };
    
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the log
    broadcastUpdate({
      newLog: logEntry
    });
  });
};

// Start the server
server.listen(port, () => {
  console.log(`USB Monitor backend server running on http://localhost:${port}`);
  initUsbDetection();
});

// Cleanup when the application is terminated
process.on('SIGINT', () => {
  usbDetect.stopMonitoring();
  console.log('USB monitoring stopped');
  process.exit();
});
