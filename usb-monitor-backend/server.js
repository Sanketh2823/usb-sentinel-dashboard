
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const usbDetect = require('node-usb-detection');
const fs = require('fs');
const path = require('path');

// Initialize Express application
const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Data storage files
const dataDir = path.join(__dirname, 'data');
const whitelistFile = path.join(dataDir, 'whitelist.json');
const blockedAttemptsFile = path.join(dataDir, 'blocked-attempts.json');
const logsFile = path.join(dataDir, 'logs.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// Initialize data files if they don't exist
function initializeDataFile(filePath, defaultData) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
}

initializeDataFile(whitelistFile, []);
initializeDataFile(blockedAttemptsFile, []);
initializeDataFile(logsFile, []);

// Read data from files
function readData(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return [];
  }
}

// Write data to files
function writeData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing to ${filePath}:`, error);
  }
}

// WebSocket connections
let connections = [];

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  connections.push(ws);
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    connections = connections.filter(conn => conn !== ws);
  });
});

// Broadcast to all connected clients
function broadcast(data) {
  connections.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// API Routes
app.get('/api/usb-devices', (req, res) => {
  const whitelistedDevices = readData(whitelistFile);
  const blockedAttempts = readData(blockedAttemptsFile);
  const logs = readData(logsFile);
  
  res.json({
    whitelistedDevices,
    blockedAttempts,
    logs
  });
});

app.post('/api/whitelist', (req, res) => {
  try {
    const device = req.body;
    
    // Validate required fields
    if (!device.productId || !device.vendorId) {
      return res.status(400).json({ success: false, message: "Product ID and Vendor ID are required" });
    }
    
    // Add ID and status
    const newDevice = {
      id: Date.now(),
      ...device,
      status: "allowed"
    };
    
    // Add to whitelist
    const whitelist = readData(whitelistFile);
    whitelist.push(newDevice);
    writeData(whitelistFile, whitelist);
    
    // Remove from blocked attempts if exists
    const blockedAttempts = readData(blockedAttemptsFile);
    const filteredBlockedAttempts = blockedAttempts.filter(item => 
      !(item.productId === device.productId && item.vendorId === device.vendorId)
    );
    writeData(blockedAttemptsFile, filteredBlockedAttempts);
    
    // Add to logs
    const logs = readData(logsFile);
    const now = new Date();
    logs.unshift({
      id: Date.now(),
      ...device,
      status: "allowed",
      date: now.toISOString(),
      time: now.toLocaleTimeString(),
      action: "whitelisted"
    });
    writeData(logsFile, logs);
    
    // Broadcast update
    broadcast({ whitelistUpdate: whitelist });
    
    res.json({ success: true, message: "Device added to whitelist" });
  } catch (error) {
    console.error("Error adding device to whitelist:", error);
    res.status(500).json({ success: false, message: "Failed to add device to whitelist" });
  }
});

// USB Detection
usbDetect.startMonitoring();

// Function to check if a device is whitelisted
function isDeviceWhitelisted(device) {
  const whitelist = readData(whitelistFile);
  return whitelist.some(item => 
    item.productId === device.productId && 
    item.vendorId === device.vendorId
  );
}

// Handle USB insert events
usbDetect.on('add', device => {
  console.log('USB device connected:', device);
  
  // Convert device data to our format
  const usbDevice = {
    productId: `0x${device.productId.toString(16)}`,
    vendorId: `0x${device.vendorId.toString(16)}`,
    manufacturer: device.manufacturer || 'Unknown',
    username: process.env.USER || 'system',
    date: new Date().toISOString(),
    time: new Date().toLocaleTimeString()
  };
  
  const isWhitelisted = isDeviceWhitelisted(usbDevice);
  const status = isWhitelisted ? "allowed" : "blocked";
  
  // Create log entry
  const logEntry = {
    id: Date.now(),
    ...usbDevice,
    status,
    action: "connected"
  };
  
  // Add to logs
  const logs = readData(logsFile);
  logs.unshift(logEntry);
  writeData(logsFile, logs);
  
  // If device is blocked, add to blocked attempts
  if (!isWhitelisted) {
    const blockedEntry = {
      id: Date.now(),
      ...usbDevice,
      status: "blocked"
    };
    
    const blockedAttempts = readData(blockedAttemptsFile);
    blockedAttempts.unshift(blockedEntry);
    writeData(blockedAttemptsFile, blockedAttempts);
    
    // Broadcast blocked attempt
    broadcast({ newBlockedAttempt: blockedEntry });
  }
  
  // Broadcast log
  broadcast({ newLog: logEntry });
});

// Handle USB remove events
usbDetect.on('remove', device => {
  console.log('USB device disconnected:', device);
  
  // Convert device data to our format
  const usbDevice = {
    productId: `0x${device.productId.toString(16)}`,
    vendorId: `0x${device.vendorId.toString(16)}`,
    manufacturer: device.manufacturer || 'Unknown',
    username: process.env.USER || 'system',
    date: new Date().toISOString(),
    time: new Date().toLocaleTimeString()
  };
  
  // Create log entry
  const logEntry = {
    id: Date.now(),
    ...usbDevice,
    status: "info",
    action: "disconnected"
  };
  
  // Add to logs
  const logs = readData(logsFile);
  logs.unshift(logEntry);
  writeData(logsFile, logs);
  
  // Broadcast log
  broadcast({ newLog: logEntry });
});

// Start the server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
