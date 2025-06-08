
const { getDeviceClass } = require('./utils/device');
const { readDataFile, writeDataFile, whitelistPath, blockedAttemptsPath, logsPath } = require('./config');
const { blockUSBDevice } = require('./controllers/usb');
const { execSync } = require('child_process');
const os = require('os');

const { isMouseClass, isStorageClass, isLikelyChargingOnly, shouldBlockDevice } = require('./helpers/deviceClass');
const { isWhitelisted, formatDeviceIds, unblockWhitelistedDevice } = require('./helpers/whitelist');
const { blockSpecificUsbDeviceOnMacOS } = require('./controllers/macos');

// Enhanced blocking for charging cables (unchanged, keep logic)
const blockChargingCable = async (device) => {
  // Only applies to macOS
  if (os.platform() !== 'darwin') return false;
  
  console.log(`Checking if this is a charging cable: ${device.vendorId}:${device.productId}`);
  
  try {
    // Check if this is a charging cable using our helper
    if (isLikelyChargingOnly(device)) {
      console.log(`Detected likely charging cable: ${device.vendorId}:${device.productId} - allowing it`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error handling charging cable:', error);
    return false;
  }
};

// Improved device block logic - more aggressive for macOS
const blockDeviceIfNotWhitelisted = async (device, deviceClass, whitelistedDevices, broadcastUpdate) => {
  // Format device identifiers consistently first
  const formattedDevice = formatDeviceIds(device);
  
  // Always allow HID/mouse devices
  if (isMouseClass(deviceClass)) {
    console.log(`Device ${formattedDevice.vendorId}:${formattedDevice.productId} is class 03 (HID/mouse), allowed.`);
    return false;
  }
  
  // Check whitelist - with improved logging
  if (isWhitelisted(device, whitelistedDevices)) {
    console.log(`Device ${formattedDevice.vendorId}:${formattedDevice.productId} is whitelisted, allowed.`);
    
    // CRITICAL CHANGE: Aggressively unblock the device immediately since it's whitelisted
    // This helps devices that were previously blocked but are now whitelisted
    try {
      console.log("CRITICAL: Executing immediate unblock for whitelisted device");
      await unblockWhitelistedDevice(device);
      
      // After unblocking, update the whitelist status to "allowed" if needed
      const existingDeviceIndex = whitelistedDevices.findIndex(
        d => d.vendorId.toLowerCase() === formattedDevice.vendorId && 
             d.productId.toLowerCase() === formattedDevice.productId
      );
      
      if (existingDeviceIndex >= 0 && whitelistedDevices[existingDeviceIndex].status !== "allowed") {
        whitelistedDevices[existingDeviceIndex].status = "allowed";
        writeDataFile(whitelistPath, whitelistedDevices);
        broadcastUpdate({ whitelistUpdate: whitelistedDevices });
        console.log("Updated whitelist device status to 'allowed'");
      }
    } catch (error) {
      console.error("Error during critical device unblocking:", error);
    }
    
    // Log allowed whitelisted device connection
    const logs = readDataFile(logsPath);
    const logEntry = {
      action: 'Allowed Device Connect',
      device: `${device.manufacturer || 'Unknown'} ${device.description || 'Device'} (${formattedDevice.vendorId}:${formattedDevice.productId})`,
      deviceClass,
      status: "allowed", // Explicitly mark as allowed
      date: new Date().toISOString(),
      id: Date.now()
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    broadcastUpdate({ newLog: logEntry });
    
    return false;
  }
  
  // Check if it's just a charging cable
  const isChargingCable = await blockChargingCable(device);
  if (isChargingCable) {
    console.log(`Device ${formattedDevice.vendorId}:${formattedDevice.productId} is a charging cable, allowed.`);
    return false;
  }

  console.log(`BLOCKING DEVICE: ${formattedDevice.vendorId}:${formattedDevice.productId} (Class: ${deviceClass})`);
  
  // More aggressive blocking for macOS
  if (os.platform() === 'darwin') {
    console.log("Using enhanced macOS blocking methods");
    await blockSpecificUsbDeviceOnMacOS(
      formattedDevice.vendorId,
      formattedDevice.productId
    );
  }
  
  // Also use the standard blocking method as a backup
  await blockUSBDevice(
    formattedDevice.vendorId,
    formattedDevice.productId
  );

  // Add to blocked attempts + logging
  const blockedAttempts = readDataFile(blockedAttemptsPath);
  
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

const setupUsbMonitor = (usbDetect, broadcastUpdate) => {
  usbDetect.startMonitoring();
  console.log('USB monitoring started');

  usbDetect.on('add', async (device) => {
    try {
      console.log(`USB device connected: ${JSON.stringify(device)}`);
      
      const whitelistedDevices = readDataFile(whitelistPath);
      const deviceClass = await getDeviceClass(
        device.vendorId.toString(16).padStart(4, "0"),
        device.productId.toString(16).padStart(4, "0")
      );

      // Log detailed device info for debugging
      console.log(`USB device details - VendorID: ${device.vendorId.toString(16)} (${device.vendorId}), ProductID: ${device.productId.toString(16)} (${device.productId}), Class: ${deviceClass}`);

      // CRITICAL CHANGE: Check immediately if this device is whitelisted, and if so try to unblock it AGGRESSIVELY
      if (isWhitelisted(device, whitelistedDevices)) {
        console.log(`Device ${device.vendorId.toString(16)}:${device.productId.toString(16)} is whitelisted, ensuring it's unblocked`);
        try {
          console.log("CRITICAL: Executing forced immediate unblock for whitelisted device on new connection");
          await unblockWhitelistedDevice(device);
          
          // IMPORTANT: Update status to "allowed" in the whitelist if needed
          const formattedDevice = formatDeviceIds(device);
          const existingDeviceIndex = whitelistedDevices.findIndex(
            d => d.vendorId.toLowerCase() === formattedDevice.vendorId && 
                 d.productId.toLowerCase() === formattedDevice.productId
          );
          
          if (existingDeviceIndex >= 0) {
            whitelistedDevices[existingDeviceIndex].status = "allowed";
            writeDataFile(whitelistPath, whitelistedDevices);
            broadcastUpdate({ whitelistUpdate: whitelistedDevices });
            console.log("Updated whitelist device status to 'allowed'");
          }
        } catch (error) {
          console.error("Error during critical device unblocking:", error);
        }
      }

      const wasBlocked = await blockDeviceIfNotWhitelisted(device, deviceClass, whitelistedDevices, broadcastUpdate);

      if (!wasBlocked) {
        const logs = readDataFile(logsPath);
        const isWhite = isWhitelisted(device, whitelistedDevices);
        const logEntry = {
          action: isWhite ? 'Allowed Device Connect' : 'Allowed HID/Mouse Device',
          device: `${device.manufacturer || 'Unknown'} ${device.description || 'Device'} (${device.vendorId.toString(16).padStart(4, "0")}:${device.productId.toString(16).padStart(4, "0")})`,
          deviceClass,
          status: "allowed",
          date: new Date().toISOString(),
          id: Date.now()
        };
        logs.unshift(logEntry);
        writeDataFile(logsPath, logs);
        broadcastUpdate({ newLog: logEntry });
      }
    } catch (error) {
      console.error('Error handling USB device connection:', error);
    }
  });

  usbDetect.on('remove', (device) => {
    console.log(`USB device disconnected: ${device.vendorId}:${device.productId}`);
  });
};

module.exports = setupUsbMonitor;
