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
router.post('/whitelist', async (req, res) => {
  try {
    const device = req.body;
    if (!device.vendorId || !device.productId) {
      return res.status(400).json({ error: 'Vendor ID and Product ID are required' });
    }
    
    const whitelistedDevices = readDataFile(whitelistPath);
    
    // Format the device IDs for consistency
    const { formatDeviceIds, unblockWhitelistedDevice } = require('../helpers/whitelist');
    const formattedDevice = formatDeviceIds(device);
    
    // Check if device is already whitelisted
    const isAlreadyWhitelisted = whitelistedDevices.some(
      (d) => d.vendorId.toLowerCase() === formattedDevice.vendorId.toLowerCase() && 
             d.productId.toLowerCase() === formattedDevice.productId.toLowerCase()
    );
    
    if (!isAlreadyWhitelisted) {
      // Create a complete device record with proper status
      const whitelistEntry = {
        ...formattedDevice,
        dateAdded: new Date().toISOString(),
        id: Date.now(),
        status: "allowed" // Ensure status is explicitly set to 'allowed'
      };
      
      // Add device to whitelist
      whitelistedDevices.push(whitelistEntry);
      writeDataFile(whitelistPath, whitelistedDevices);
      
      // Try to unblock the device since it's now whitelisted
      const unblockResult = await unblockWhitelistedDevice(formattedDevice);
      
      // Log the action
      const logs = readDataFile(logsPath);
      const logEntry = {
        action: 'Add to Whitelist',
        device: `${device.name || formattedDevice.manufacturer || 'Unknown device'} (${formattedDevice.vendorId}:${formattedDevice.productId})`,
        date: new Date().toISOString(),
        status: unblockResult ? 'success' : 'partial',
        message: unblockResult ? 'Device whitelisted and unblocked' : 'Device whitelisted but may need reconnection',
        id: Date.now()
      };
      logs.unshift(logEntry);
      writeDataFile(logsPath, logs);
      
      // Broadcast update
      broadcastUpdate({
        whitelistUpdate: whitelistedDevices,
        newLog: logEntry
      });
      
      res.json({ 
        success: true, 
        message: unblockResult ? 
          'Device added to whitelist and unblocked' : 
          'Device added to whitelist - please disconnect and reconnect to complete' 
      });
    } else {
      // If already whitelisted, still try to unblock it (user may be trying to fix a blocked device)
      const unblockResult = await unblockWhitelistedDevice(formattedDevice);
      
      res.json({ 
        success: true, 
        message: unblockResult ? 
          'Device already in whitelist - unblock attempt successful' : 
          'Device already in whitelist - please disconnect and reconnect' 
      });
    }
  } catch (error) {
    console.error('Error adding device to whitelist:', error);
    res.status(500).json({ error: 'Failed to add device to whitelist', message: error.message });
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

// Update the block device function in usb-monitor.js to check if device is already whitelisted before blocking
const blockDeviceIfNotWhitelisted = async (device, deviceClass, whitelistedDevices, broadcastUpdate) => {
  // Format device identifiers consistently first
  const { formatDeviceIds } = require('../helpers/whitelist');
  const formattedDevice = formatDeviceIds(device);
  
  // Always allow HID/mouse devices
  const { isMouseClass } = require('../helpers/deviceClass');
  if (isMouseClass(deviceClass)) {
    console.log(`Device ${formattedDevice.vendorId}:${formattedDevice.productId} is class 03 (HID/mouse), allowed.`);
    return false;
  }
  
  // Check whitelist - improved for more reliable detection
  const { isWhitelisted } = require('../helpers/whitelist');
  if (isWhitelisted(device, whitelistedDevices)) {
    console.log(`Device ${formattedDevice.vendorId}:${formattedDevice.productId} is whitelisted, allowed.`);
    
    // Log the allowed device
    const logs = readDataFile(logsPath);
    const logEntry = {
      action: 'Whitelisted Device Connect',
      device: `${device.manufacturer || 'Unknown'} ${device.description || 'Device'} (${formattedDevice.vendorId}:${formattedDevice.productId})`,
      deviceClass,
      status: "allowed",  // Explicitly mark as allowed
      date: new Date().toISOString(),
      id: Date.now()
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    broadcastUpdate({ newLog: logEntry });
    
    return false;
  }
  
  // Check if it's just a charging cable
  const { blockChargingCable } = require('../usb-monitor');
  const isChargingCable = await blockChargingCable(device);
  if (isChargingCable) {
    console.log(`Device ${formattedDevice.vendorId}:${formattedDevice.productId} is a charging cable, allowed.`);
    return false;
  }

  console.log(`BLOCKING DEVICE: ${formattedDevice.vendorId}:${formattedDevice.productId} (Class: ${deviceClass})`);
  
  // More aggressive blocking for macOS
  const os = require('os');
  if (os.platform() === 'darwin') {
    console.log("Using enhanced macOS blocking methods");
    const { blockSpecificUsbDeviceOnMacOS } = require('../controllers/macos');
    await blockSpecificUsbDeviceOnMacOS(
      formattedDevice.vendorId,
      formattedDevice.productId
    );
  }
  
  // Also use the standard blocking method as a backup
  const { blockUSBDevice } = require('../controllers/usb');
  await blockUSBDevice(
    formattedDevice.vendorId,
    formattedDevice.productId
  );

  // Add to blocked attempts + logging
  const blockedAttempts = readDataFile(blockedAttemptsPath);
  
  const { isStorageClass } = require('../helpers/deviceClass');
  const deviceInfo = {
    vendorId: formattedDevice.vendorId,
    productId: formattedDevice.productId,
    deviceClass,
    manufacturer: device.manufacturer || 'Unknown',
    description: device.description || 'Unknown Device',
    isStorage: isStorageClass(deviceClass),
    status: "blocked",
    date: new Date().toISOString(),
    id: Date.now()
  };
  
  // Log details for troubleshooting
  console.log(`Adding to blocked attempts: ${JSON.stringify(deviceInfo)}`);
  
  // Ensure we're actually adding it to the blockedAttempts array
  blockedAttempts.unshift(deviceInfo);
  writeDataFile(blockedAttemptsPath, blockedAttempts);

  const logs = readDataFile(logsPath);
  const logEntry = {
    action: 'Block Attempt',
    device: `${deviceInfo.manufacturer || 'Unknown'} ${deviceInfo.description || 'Device'} (${deviceInfo.vendorId}:${deviceInfo.productId})`,
    deviceClass,
    deviceType: isStorageClass(deviceClass) ? 'Storage Device' : 'Standard Device',
    status: "blocked",
    date: new Date().toISOString(),
    id: Date.now()
  };
  logs.unshift(logEntry);
  writeDataFile(logsPath, logs);

  // Broadcast both the blockedAttempts update and the new log
  broadcastUpdate({
    blockedAttemptsUpdate: blockedAttempts,
    newLog: logEntry,
    newBlockedAttempt: deviceInfo  // Make sure this is included for the UI update
  });

  return true;
};

module.exports = {
  router,
  setBroadcastWss,
  broadcastUpdate
};
