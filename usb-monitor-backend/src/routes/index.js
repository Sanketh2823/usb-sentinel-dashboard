const express = require('express');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const { readDataFile, writeDataFile, whitelistPath, blockedAttemptsPath, logsPath } = require('../config');
const { blockUSBDevice, forceBlockUSBDevice, ejectUSBDevice, refreshUSBDevices } = require('../controllers/usb');
const { blockSpecificUsbDeviceOnMacOS, blockUsbClassOnMacOS } = require('../controllers/macos');
const { formatDeviceIds, unblockWhitelistedDevice } = require('../helpers/whitelist');
const { getDeviceClass } = require('../utils/device');

const router = express.Router();
let wss;

const setBroadcastWss = (websocket) => {
  wss = websocket;
};

const broadcastUpdate = (data) => {
  if (wss) {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify(data));
      }
    });
  }
};

// Helper function to determine connection type
const determineConnectionType = (device) => {
  if (!device) return 'USB';
  
  const deviceStr = (device.description || device.manufacturer || '').toLowerCase();
  const deviceClass = (device.deviceClass || '').toLowerCase();
  
  if (deviceClass.includes('network') || 
      deviceStr.includes('ethernet') ||
      deviceStr.includes('wifi') ||
      deviceStr.includes('bluetooth') ||
      deviceStr.includes('wireless')) {
    return 'Network';
  }
  
  return 'USB';
};

router.get('/usb-devices', (req, res) => {
  try {
    const whitelistedDevices = readDataFile(whitelistPath);
    const blockedAttempts = readDataFile(blockedAttemptsPath);
    const logs = readDataFile(logsPath);
    const allowedClasses = readDataFile('./data/allowedClasses.json');
    
    res.json({
      whitelistedDevices,
      blockedAttempts,
      logs,
      allowedClasses
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/whitelist', async (req, res) => {
  try {
    console.log("Received whitelist request:", JSON.stringify(req.body));
    const whitelistedDevices = readDataFile(whitelistPath);
    
    // Normalize device IDs
    const device = req.body;
    const normalizedDevice = formatDeviceIds(device);
    
    console.log(`Normalized device IDs: ${normalizedDevice.vendorId}:${normalizedDevice.productId}`);
    
    // Check if already in whitelist
    const existingDeviceIndex = whitelistedDevices.findIndex(d => 
      d.vendorId.replace(/^0x/i, '').toLowerCase() === normalizedDevice.vendorId &&
      d.productId.replace(/^0x/i, '').toLowerCase() === normalizedDevice.productId
    );
    
    // Process whitelist addition
    let updatedDevice;
    if (existingDeviceIndex >= 0) {
      console.log("Device already in whitelist, updating status");
      whitelistedDevices[existingDeviceIndex] = {
        ...whitelistedDevices[existingDeviceIndex],
        ...req.body,
        status: "allowed",
        vendorId: normalizedDevice.vendorId,
        productId: normalizedDevice.productId,
        date: new Date().toISOString()
      };
      updatedDevice = whitelistedDevices[existingDeviceIndex];
    } else {
      console.log("Adding new device to whitelist");
      const newDevice = {
        id: Date.now(),
        ...req.body,
        vendorId: normalizedDevice.vendorId,
        productId: normalizedDevice.productId,
        status: "allowed",
        date: new Date().toISOString()
      };
      whitelistedDevices.push(newDevice);
      updatedDevice = newDevice;
    }
    
    // Save the updated whitelist
    writeDataFile(whitelistPath, whitelistedDevices);
    
    // CRITICAL: Unblock the device explicitly
    console.log("CRITICAL: Executing immediate unblock for whitelisted device");
    
    // Create device object for unblockWhitelistedDevice
    const deviceToUnblock = {
      vendorId: normalizedDevice.vendorId,
      productId: normalizedDevice.productId
    };
    
    // Unblock the device in a way that won't throw if it fails
    try {
      await unblockWhitelistedDevice(deviceToUnblock);
      console.log("Unblocking completed");
    } catch (unblockError) {
      console.error("Error during device unblocking:", unblockError);
    }
    
    // Add to logs with connection type
    const logs = readDataFile(logsPath);
    const connectionType = determineConnectionType(device);
    const logEntry = {
      action: 'Whitelist Addition',
      device: `${device.manufacturer || 'Unknown'} ${device.description || 'Device'} (${normalizedDevice.vendorId}:${normalizedDevice.productId})`,
      deviceClass: device.deviceClass || 'Unknown',
      connectionType,
      status: "allowed",
      date: new Date().toISOString(),
      id: Date.now(),
      username: device.username || 'System'
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast update
    broadcastUpdate({ 
      whitelistUpdate: whitelistedDevices,
      newLog: logEntry
    });
    
    // Clean up any blocking processes and files
    try {
      console.log("Running cleanup for blocking files");
      cleanupBlockingFiles();
    } catch (cleanupError) {
      console.error("Error during cleanup:", cleanupError);
    }
    
    res.json({ 
      success: true, 
      message: 'Device added to whitelist successfully',
      device: updatedDevice
    });
  } catch (error) {
    console.error("Error processing whitelist request:", error);
    res.status(500).json({ error: error.message });
  }
});

// Add this helper function for cleaning up blocking files
const cleanupBlockingFiles = () => {
  if (os.platform() === 'darwin') {
    try {
      console.log("Cleaning up any blocking files...");
      
      // Remove the LaunchDaemon files that cause issues
      execSync(`sudo rm -f /Library/LaunchDaemons/com.usbmonitor.blockusb.plist 2>/dev/null || true`);
      execSync(`sudo rm -f /Library/LaunchDaemons/com.usbmonitor.enhanced.plist 2>/dev/null || true`);
      
      // Unload the services if they exist
      execSync(`sudo launchctl unload /Library/LaunchDaemons/com.usbmonitor.blockusb.plist 2>/dev/null || true`);
      execSync(`sudo launchctl unload /Library/LaunchDaemons/com.usbmonitor.enhanced.plist 2>/dev/null || true`);
      
      // Remove any temporary block scripts
      execSync(`sudo rm -f /tmp/usb_block_*.sh 2>/dev/null || true`);
      
      // Kill any running blocking processes
      execSync(`sudo pkill -f "enhanced-block-usb-storage.sh" 2>/dev/null || true`);
      
      // Reload USB drivers to ensure clean state
      execSync(`sudo kextload -b com.apple.driver.usb.massstorage 2>/dev/null || true`);
      execSync(`sudo kextload -b com.apple.iokit.IOUSBMassStorageClass 2>/dev/null || true`);
      
      console.log("Cleanup completed successfully");
      return true;
    } catch (err) {
      console.log("Warning during cleanup:", err.message);
      return false;
    }
  }
  return true;
};

// Expose the cleanup endpoint
router.post('/cleanup-blocking-files', (req, res) => {
  try {
    const result = cleanupBlockingFiles();
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add this endpoint to explicitly unblock a device
router.post('/unblock-device', async (req, res) => {
  try {
    const { vendorId, productId } = req.body;
    console.log(`Received explicit unblock request for device ${vendorId}:${productId}`);
    
    // Create device object for unblockWhitelistedDevice
    const deviceToUnblock = {
      vendorId,
      productId
    };
    
    // Unblock the device
    const success = await unblockWhitelistedDevice(deviceToUnblock);
    
    // Always run cleanup to ensure blocking files are removed
    cleanupBlockingFiles();
    
    res.json({ 
      success, 
      message: success ? 
        `Device ${vendorId}:${productId} unblocked successfully` : 
        `Failed to unblock device ${vendorId}:${productId}`
    });
  } catch (error) {
    console.error("Error unblocking device:", error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/whitelist/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    let whitelistedDevices = readDataFile(whitelistPath);
    const initialLength = whitelistedDevices.length;
    whitelistedDevices = whitelistedDevices.filter(device => device.id !== id);
    if (whitelistedDevices.length === initialLength) {
      return res.status(404).json({ error: 'Device not found' });
    }
    writeDataFile(whitelistPath, whitelistedDevices);
    broadcastUpdate({ whitelistUpdate: whitelistedDevices });
    res.json({ success: true, message: 'Device removed from whitelist' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/force-block-device', async (req, res) => {
  try {
    const { vendorId, productId } = req.body;
    const result = await forceBlockUSBDevice(vendorId, productId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/block-usb-class', async (req, res) => {
  try {
    const { classId } = req.body;
    const result = await blockUsbClassOnMacOS(classId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/allowed-classes', (req, res) => {
  try {
    const allowedClasses = readDataFile('./data/allowedClasses.json');
    res.json(allowedClasses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/allowed-classes', (req, res) => {
  try {
    const allowedClasses = req.body;
    writeDataFile('./data/allowedClasses.json', allowedClasses);
    broadcastUpdate({ allowedClassesUpdate: allowedClasses });
    res.json({ success: true, message: 'Allowed classes updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/eject-device', async (req, res) => {
  try {
    const { vendorId, productId } = req.body;
    const platform = os.platform();
    const result = await ejectUSBDevice(vendorId, productId, platform);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/refresh-devices', async (req, res) => {
  try {
    const platform = os.platform();
    const result = await refreshUSBDevices(platform);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = {
  router,
  setBroadcastWss,
  broadcastUpdate
};
