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
const { unblockWhitelistedDevice } = require('../helpers/whitelist');

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

// NEW ENDPOINT: Explicit unblock device endpoint
router.post('/unblock-device', async (req, res) => {
  try {
    const { vendorId, productId } = req.body;
    if (!vendorId || !productId) {
      return res.status(400).json({ error: 'Vendor ID and Product ID are required' });
    }
    
    console.log(`Explicit unblock request for device: ${vendorId}:${productId}`);
    
    // Format device for consistency
    const { formatDeviceIds } = require('../helpers/whitelist');
    const device = formatDeviceIds({ vendorId, productId });
    
    // Use the unblock function from whitelist helpers
    const unblockResult = await unblockWhitelistedDevice(device);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      action: 'Unblock Device',
      device: `${vendorId}:${productId}`,
      status: unblockResult ? 'success' : 'failed',
      date: new Date().toISOString(),
      id: Date.now()
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the update
    broadcastUpdate({
      newLog: logEntry
    });
    
    res.json({ 
      success: unblockResult, 
      message: unblockResult ? 
        'Device unblocked successfully' : 
        'Device unblock attempted but may require reconnection'
    });
  } catch (error) {
    console.error('Error unblocking device:', error);
    res.status(500).json({ error: 'Failed to unblock device', message: error.message });
  }
});

// Add device to whitelist endpoint
router.post('/whitelist', async (req, res) => {
  try {
    const device = req.body;
    if (!device.vendorId || !device.productId) {
      return res.status(400).json({ error: 'Vendor ID and Product ID are required' });
    }
    
    console.log("Received whitelist request for device:", JSON.stringify(device));
    
    const whitelistedDevices = readDataFile(whitelistPath);
    
    // Format the device IDs for consistency
    const { formatDeviceIds, unblockWhitelistedDevice } = require('../helpers/whitelist');
    const formattedDevice = formatDeviceIds(device);
    
    console.log("Formatted device for whitelist:", JSON.stringify(formattedDevice));
    
    // Check if device is already whitelisted
    const isAlreadyWhitelisted = whitelistedDevices.some(
      (d) => d.vendorId.toLowerCase() === formattedDevice.vendorId.toLowerCase() && 
             d.productId.toLowerCase() === formattedDevice.productId.toLowerCase()
    );
    
    let whitelistEntry;
    let unblockResult = false;
    
    // IMPORTANT: Always attempt unblocking aggressively, whether the device is new or already whitelisted
    try {
      console.log("CRITICAL: Executing immediate unblock attempt for device");
      unblockResult = await unblockWhitelistedDevice(formattedDevice);
      console.log(`Device unblock result: ${unblockResult ? "Success" : "Partial success, may need reconnection"}`);
      
      // If first unblock fails, try again with a slight delay - sometimes helps on macOS
      if (!unblockResult) {
        console.log("First unblock attempt didn't fully succeed, trying again after delay...");
        setTimeout(async () => {
          try {
            await unblockWhitelistedDevice(formattedDevice);
            console.log("Second unblock attempt completed");
          } catch (error) {
            console.error("Error in second unblock attempt:", error);
          }
        }, 500);
      }
    } catch (unblockError) {
      console.error("Error during device unblocking:", unblockError);
    }
    
    if (!isAlreadyWhitelisted) {
      // Create a complete device record with proper status
      whitelistEntry = {
        ...formattedDevice,
        dateAdded: new Date().toISOString(),
        id: Date.now(),
        status: "allowed", // Ensure status is explicitly set to 'allowed'
        name: device.name || formattedDevice.manufacturer || `Device ${formattedDevice.vendorId}:${formattedDevice.productId}`
      };
      
      console.log("Adding new device to whitelist:", JSON.stringify(whitelistEntry));
      
      // Add device to whitelist
      whitelistedDevices.push(whitelistEntry);
      writeDataFile(whitelistPath, whitelistedDevices);
      
      // Log the action
      const logs = readDataFile(logsPath);
      const logEntry = {
        action: 'Add to Whitelist',
        device: `${whitelistEntry.name || 'Unknown device'} (${formattedDevice.vendorId}:${formattedDevice.productId})`,
        date: new Date().toISOString(),
        status: unblockResult ? 'success' : 'partial',
        message: unblockResult ? 'Device whitelisted and unblocked' : 'Device whitelisted but may need reconnection',
        id: Date.now()
      };
      logs.unshift(logEntry);
      writeDataFile(logsPath, logs);
      
      // Broadcast update IMMEDIATELY
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
      // Find the existing entry to update its status
      const existingDeviceIndex = whitelistedDevices.findIndex(
        d => d.vendorId.toLowerCase() === formattedDevice.vendorId.toLowerCase() && 
             d.productId.toLowerCase() === formattedDevice.productId.toLowerCase()
      );
      
      if (existingDeviceIndex >= 0) {
        // Update the status to "allowed"
        whitelistedDevices[existingDeviceIndex].status = "allowed";
        writeDataFile(whitelistPath, whitelistedDevices);
        
        console.log("Updated existing whitelisted device:", JSON.stringify(whitelistedDevices[existingDeviceIndex]));
      }
      
      // Log the action for already whitelisted device
      const logs = readDataFile(logsPath);
      const logEntry = {
        action: 'Update Whitelisted Device',
        device: `${device.name || formattedDevice.manufacturer || 'Unknown device'} (${formattedDevice.vendorId}:${formattedDevice.productId})`,
        date: new Date().toISOString(),
        status: unblockResult ? 'success' : 'partial',
        message: unblockResult ? 'Device unblock successful' : 'Device may need reconnection',
        id: Date.now()
      };
      logs.unshift(logEntry);
      writeDataFile(logsPath, logs);
      
      // Broadcast update IMMEDIATELY
      broadcastUpdate({
        whitelistUpdate: whitelistedDevices,
        newLog: logEntry
      });
      
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

// NEW ENDPOINT: Cleanup blocking files (LaunchDaemon plist, etc.)
router.post('/cleanup-blocking-files', async (req, res) => {
  try {
    const { execSync } = require('child_process');
    const os = require('os');
    
    console.log("Executing cleanup of all blocking files");
    
    if (os.platform() === 'darwin') {
      try {
        // Unload and remove the LaunchDaemon files that cause permanent blocking
        console.log("Removing LaunchDaemon files...");
        
        // Try to unload the LaunchDaemons first (ignoring errors)
        execSync('sudo launchctl unload /Library/LaunchDaemons/com.usbmonitor.blockusb.plist 2>/dev/null || true');
        execSync('sudo launchctl unload /Library/LaunchDaemons/com.usbmonitor.enhanced.plist 2>/dev/null || true');
        
        // Then remove the files
        execSync('sudo rm -f /Library/LaunchDaemons/com.usbmonitor.blockusb.plist 2>/dev/null || true');
        execSync('sudo rm -f /Library/LaunchDaemons/com.usbmonitor.enhanced.plist 2>/dev/null || true');
        
        // Clean up any USB blocking scripts
        execSync('sudo rm -f /usr/local/bin/usb-monitor/enhanced-block-usb-storage.sh 2>/dev/null || true');
        execSync('sudo rm -f /tmp/usb_block_*.sh 2>/dev/null || true');
        
        // Try to reload USB modules to reset USB subsystem
        execSync('sudo kextunload -b com.apple.iokit.IOUSBHostFamily 2>/dev/null || true');
        execSync('sudo kextload -b com.apple.iokit.IOUSBHostFamily 2>/dev/null || true');
        
        console.log("LaunchDaemon cleanup completed successfully");
      } catch (macError) {
        console.error("Error during macOS cleanup:", macError);
        // Continue even if errors occur
      }
    } else if (os.platform() === 'win32') {
      // Windows cleanup if needed
      console.log("Windows-specific cleanup not needed");
    } else {
      // Linux cleanup if needed
      try {
        execSync('sudo rm -f /etc/udev/rules.d/99-usb-block.rules 2>/dev/null || true');
        console.log("Linux cleanup completed");
      } catch (linuxError) {
        console.error("Error during Linux cleanup:", linuxError);
      }
    }
    
    // Also clean up using the dedicated device manager cleanup function
    const deviceManager = require('../controllers/device-manager');
    await deviceManager.cleanupBlockingFiles();
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      action: 'Cleanup Blocking Files',
      status: 'success',
      message: 'Removed all persistent blocking files',
      date: new Date().toISOString(),
      id: Date.now()
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the update
    broadcastUpdate({
      newLog: logEntry
    });
    
    res.json({ 
      success: true, 
      message: 'Blocking files cleanup completed' 
    });
  } catch (error) {
    console.error('Error cleaning up blocking files:', error);
    res.status(500).json({ error: 'Failed to clean up blocking files', message: error.message });
  }
});

module.exports = {
  router,
  setBroadcastWss,
  broadcastUpdate
};
