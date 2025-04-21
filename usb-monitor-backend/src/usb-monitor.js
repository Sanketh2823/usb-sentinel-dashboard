const { getDeviceClass } = require('./utils/device');
const { readDataFile, writeDataFile, whitelistPath, blockedAttemptsPath, logsPath } = require('./config');
const { blockUSBDevice } = require('./controllers/usb');
const { execSync } = require('child_process');
const os = require('os');

const { isMouseClass, isStorageClass, isLikelyChargingOnly, shouldBlockDevice } = require('./helpers/deviceClass');
const { isWhitelisted } = require('./helpers/whitelist');

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

// Device block logic: allow HID/mouse or whitelisted, else block
const blockDeviceIfNotWhitelisted = async (device, deviceClass, whitelistedDevices, broadcastUpdate) => {
  if (isMouseClass(deviceClass)) {
    console.log(`Device ${device.vendorId}:${device.productId} is class 03 (HID/mouse), allowed.`);
    return false;
  }
  
  if (isWhitelisted(device, whitelistedDevices)) {
    console.log(`Device ${device.vendorId}:${device.productId} is whitelisted, allowed.`);
    return false;
  }
  
  // Check if it's just a charging cable
  const isChargingCable = await blockChargingCable(device);
  if (isChargingCable) {
    console.log(`Device ${device.vendorId}:${device.productId} is a charging cable, allowed.`);
    return false;
  }

  console.log(`Blocking device: ${device.vendorId}:${device.productId} (Class: ${deviceClass})`);
  
  await blockUSBDevice(
    device.vendorId.toString(16),
    device.productId.toString(16)
  );

  // Add to blocked attempts + logging
  const blockedAttempts = readDataFile(blockedAttemptsPath);
  const deviceInfo = {
    vendorId: device.vendorId.toString(16).padStart(4, "0"),
    productId: device.productId.toString(16).padStart(4, "0"),
    deviceClass,
    manufacturer: device.manufacturer || 'Unknown',
    description: device.description || 'Unknown Device',
    isStorage: isStorageClass(deviceClass),
    status: "blocked",
    date: new Date().toISOString(),
    id: Date.now()
  };
  
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
    newLog: logEntry
  });

  return true;
};

const setupUsbMonitor = (usbDetect, broadcastUpdate) => {
  usbDetect.startMonitoring();
  console.log('USB monitoring started');

  usbDetect.on('add', async (device) => {
    try {
      const whitelistedDevices = readDataFile(whitelistPath);
      const deviceClass = await getDeviceClass(
        device.vendorId.toString(16).padStart(4, "0"),
        device.productId.toString(16).padStart(4, "0")
      );

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
