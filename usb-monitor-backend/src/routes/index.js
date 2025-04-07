
const express = require('express');
const os = require('os');
const { 
  readDataFile, 
  writeDataFile, 
  whitelistPath, 
  blockedAttemptsPath, 
  logsPath, 
  allowedClassesPath 
} = require('../config');
const { 
  checkSystemPrivileges, 
  getPermissionInstructions 
} = require('../utils/system');
const {
  blockUSBDevice,
  forceBlockUSBDevice,
  ejectUSBDevice,
  refreshUSBDevices
} = require('../controllers/usb');
const { blockUsbClassOnMacOS } = require('../controllers/macos');

const router = express.Router();

// Function to broadcast updates to all connected clients
let wss;
const setBroadcastWss = (webSocketServer) => {
  wss = webSocketServer;
};

// Broadcast updates to all connected clients
const broadcastUpdate = (data) => {
  if (!wss) return;
  
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(JSON.stringify(data));
    }
  });
};

// Check system permissions endpoint
router.get('/system-permissions', async (req, res) => {
  try {
    const hasPrivileges = await checkSystemPrivileges();
    const permissionInstructions = getPermissionInstructions();
    
    res.json({
      hasSystemPrivileges: hasPrivileges,
      platform: os.platform(),
      permissionInstructions
    });
  } catch (error) {
    console.error('Error checking system permissions:', error);
    res.status(500).json({ error: 'Failed to check system permissions' });
  }
});

// Block USB class endpoint
router.post('/block-usb-class', async (req, res) => {
  try {
    const { classId } = req.body;
    if (!classId) {
      return res.status(400).json({ error: 'Class ID is required' });
    }
    
    const platform = os.platform();
    let result = { success: false, message: 'Unsupported platform' };
    
    console.log(`Attempting to block USB class ${classId} on ${platform}`);
    
    if (platform === 'darwin') {
      // macOS implementation
      result = await blockUsbClassOnMacOS(classId);
    } else if (platform === 'win32') {
      // Windows implementation
      result = { success: false, message: 'Windows class blocking not yet implemented' };
    } else {
      // Linux implementation
      result = { success: false, message: 'Linux class blocking not yet implemented' };
    }
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      action: `Block USB Class ${classId}`,
      status: result.success ? 'success' : 'failed',
      message: result.message,
      date: new Date().toISOString(),
      id: Date.now()
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the update
    broadcastUpdate({
      newLog: logEntry
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error blocking USB class:', error);
    res.status(500).json({ error: 'Failed to block USB class', message: error.message });
  }
});

// Get USB devices endpoint
router.get('/usb-devices', (req, res) => {
  try {
    const whitelistedDevices = readDataFile(whitelistPath);
    const blockedAttempts = readDataFile(blockedAttemptsPath);
    const logs = readDataFile(logsPath);
    const allowedClasses = readDataFile(allowedClassesPath);
    
    res.json({
      whitelistedDevices,
      blockedAttempts,
      logs,
      allowedClasses
    });
  } catch (error) {
    console.error('Error retrieving USB devices:', error);
    res.status(500).json({ error: 'Failed to retrieve USB devices' });
  }
});

// Get allowed device classes endpoint
router.get('/allowed-classes', (req, res) => {
  try {
    const allowedClasses = readDataFile(allowedClassesPath);
    res.json(allowedClasses);
  } catch (error) {
    console.error('Error retrieving allowed classes:', error);
    res.status(500).json({ error: 'Failed to retrieve allowed classes' });
  }
});

// Update allowed device classes endpoint
router.post('/allowed-classes', (req, res) => {
  try {
    const allowedClasses = req.body;
    writeDataFile(allowedClassesPath, allowedClasses);
    
    // Broadcast update
    broadcastUpdate({
      allowedClassesUpdate: allowedClasses
    });
    
    res.json({ success: true, message: 'Allowed classes updated successfully' });
  } catch (error) {
    console.error('Error updating allowed classes:', error);
    res.status(500).json({ error: 'Failed to update allowed classes' });
  }
});

// Add device to whitelist endpoint
router.post('/whitelist', (req, res) => {
  try {
    const device = req.body;
    if (!device.vendorId || !device.productId) {
      return res.status(400).json({ error: 'Vendor ID and Product ID are required' });
    }
    
    const whitelistedDevices = readDataFile(whitelistPath);
    
    // Check if device is already whitelisted
    const isAlreadyWhitelisted = whitelistedDevices.some(
      (d) => d.vendorId === device.vendorId && d.productId === device.productId
    );
    
    if (!isAlreadyWhitelisted) {
      // Add device to whitelist
      whitelistedDevices.push({
        ...device,
        dateAdded: new Date().toISOString(),
        id: Date.now()
      });
      
      writeDataFile(whitelistPath, whitelistedDevices);
      
      // Log the action
      const logs = readDataFile(logsPath);
      const logEntry = {
        action: 'Add to Whitelist',
        device: `${device.name} (${device.vendorId}:${device.productId})`,
        date: new Date().toISOString(),
        id: Date.now()
      };
      logs.unshift(logEntry);
      writeDataFile(logsPath, logs);
      
      // Broadcast update
      broadcastUpdate({
        whitelistUpdate: whitelistedDevices,
        newLog: logEntry
      });
      
      res.json({ success: true, message: 'Device added to whitelist' });
    } else {
      res.json({ success: true, message: 'Device already in whitelist' });
    }
  } catch (error) {
    console.error('Error adding device to whitelist:', error);
    res.status(500).json({ error: 'Failed to add device to whitelist' });
  }
});

// Remove device from whitelist endpoint
router.delete('/whitelist/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const whitelistedDevices = readDataFile(whitelistPath);
    const deviceIndex = whitelistedDevices.findIndex((d) => d.id === Number(id));
    
    if (deviceIndex !== -1) {
      const removedDevice = whitelistedDevices[deviceIndex];
      
      // Remove device from whitelist
      whitelistedDevices.splice(deviceIndex, 1);
      writeDataFile(whitelistPath, whitelistedDevices);
      
      // Log the action
      const logs = readDataFile(logsPath);
      const logEntry = {
        action: 'Remove from Whitelist',
        device: `${removedDevice.name} (${removedDevice.vendorId}:${removedDevice.productId})`,
        date: new Date().toISOString(),
        id: Date.now()
      };
      logs.unshift(logEntry);
      writeDataFile(logsPath, logs);
      
      // Broadcast update
      broadcastUpdate({
        whitelistUpdate: whitelistedDevices,
        newLog: logEntry
      });
      
      res.json({ success: true, message: 'Device removed from whitelist' });
    } else {
      res.status(404).json({ error: 'Device not found in whitelist' });
    }
  } catch (error) {
    console.error('Error removing device from whitelist:', error);
    res.status(500).json({ error: 'Failed to remove device from whitelist' });
  }
});

// Clear logs endpoint
router.delete('/logs', (req, res) => {
  try {
    writeDataFile(logsPath, []);
    
    // Broadcast update
    broadcastUpdate({
      logsUpdate: []
    });
    
    res.json({ success: true, message: 'Logs cleared successfully' });
  } catch (error) {
    console.error('Error clearing logs:', error);
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

// Clear blocked attempts endpoint
router.delete('/blocked-attempts', (req, res) => {
  try {
    writeDataFile(blockedAttemptsPath, []);
    
    // Broadcast update
    broadcastUpdate({
      blockedAttemptsUpdate: []
    });
    
    res.json({ success: true, message: 'Blocked attempts cleared successfully' });
  } catch (error) {
    console.error('Error clearing blocked attempts:', error);
    res.status(500).json({ error: 'Failed to clear blocked attempts' });
  }
});

// Eject USB device endpoint
router.post('/eject-device', async (req, res) => {
  try {
    const { vendorId, productId } = req.body;
    if (!vendorId || !productId) {
      return res.status(400).json({ error: 'Vendor ID and Product ID are required' });
    }
    
    const platform = os.platform();
    
    // Attempt to eject device
    const result = await ejectUSBDevice(vendorId, productId, platform);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      action: 'Eject Device',
      device: `${vendorId}:${productId}`,
      status: result.success ? 'success' : 'failed',
      message: result.message,
      date: new Date().toISOString(),
      id: Date.now()
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the update
    broadcastUpdate({
      newLog: logEntry
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error ejecting device:', error);
    res.status(500).json({ error: 'Failed to eject device', message: error.message });
  }
});

// Block USB device endpoint
router.post('/block-device', async (req, res) => {
  try {
    const { vendorId, productId } = req.body;
    if (!vendorId || !productId) {
      return res.status(400).json({ error: 'Vendor ID and Product ID are required' });
    }
    
    // Attempt to block device
    const success = await blockUSBDevice(vendorId, productId);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      action: 'Block Device',
      device: `${vendorId}:${productId}`,
      status: success ? 'success' : 'failed',
      date: new Date().toISOString(),
      id: Date.now()
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the update
    broadcastUpdate({
      newLog: logEntry
    });
    
    res.json({ success, message: success ? 'Device blocked successfully' : 'Failed to block device' });
  } catch (error) {
    console.error('Error blocking device:', error);
    res.status(500).json({ error: 'Failed to block device', message: error.message });
  }
});

// Force block USB device endpoint
router.post('/force-block-device', async (req, res) => {
  try {
    const { vendorId, productId } = req.body;
    if (!vendorId || !productId) {
      return res.status(400).json({ error: 'Vendor ID and Product ID are required' });
    }
    
    // Attempt to force block device
    const result = await forceBlockUSBDevice(vendorId, productId);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      action: 'Force Block Device',
      device: `${vendorId}:${productId}`,
      status: result.success ? 'success' : 'failed',
      message: result.message,
      date: new Date().toISOString(),
      id: Date.now()
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the update
    broadcastUpdate({
      newLog: logEntry
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error force blocking device:', error);
    res.status(500).json({ error: 'Failed to force block device', message: error.message });
  }
});

// Refresh USB devices endpoint
router.post('/refresh-devices', async (req, res) => {
  try {
    const platform = os.platform();
    
    // Attempt to refresh USB devices
    const result = await refreshUSBDevices(platform);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      action: 'Refresh USB Devices',
      status: result.success ? 'success' : 'failed',
      message: result.message,
      date: new Date().toISOString(),
      id: Date.now()
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the update
    broadcastUpdate({
      newLog: logEntry
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error refreshing USB devices:', error);
    res.status(500).json({ error: 'Failed to refresh USB devices', message: error.message });
  }
});

module.exports = {
  router,
  setBroadcastWss,
  broadcastUpdate
};
