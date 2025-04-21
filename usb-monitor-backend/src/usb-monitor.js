const { getDeviceClass } = require('./utils/device');
const { readDataFile, writeDataFile, whitelistPath, blockedAttemptsPath, logsPath } = require('./config');
const { blockUSBDevice } = require('./controllers/usb');
const { execSync } = require('child_process');
const os = require('os');

const { isMouseClass, shouldBlockDevice } = require('./helpers/deviceClass');
const { isWhitelisted } = require('./helpers/whitelist');

// Enhanced blocking for charging cables (unchanged, keep logic)
const blockChargingCable = async (device) => {
  // Only applies to macOS
  if (os.platform() !== 'darwin') return false;
  
  console.log(`Attempting to block charging cable: ${device.vendorId}:${device.productId}`);
  
  try {
    // Try to identify if this is a charging cable (Apple products often have specific vendor IDs)
    const isLikelyChargingCable = 
      // Apple vendor ID for many accessories
      device.vendorId === 0x05ac || 
      // Common Apple Watch and iPhone charging vendor IDs 
      device.vendorId === 0x1452 ||
      // Check device name for charging-related keywords if available
      (device.manufacturer && 
        (device.manufacturer.toLowerCase().includes('apple') || 
         device.manufacturer.toLowerCase().includes('charging')));

    if (isLikelyChargingCable) {
      console.log(`Detected likely charging cable: ${device.vendorId}:${device.productId}`);
      
      // For charging cables, try multiple blocking approaches
      // 1. Try USB power management
      execSync('sudo pmset -a usbpower 0').toString();
      
      // 2. Try IOKit power assertions
      const powerAssertCommand = `sudo ioreg -r -c IOPMrootDomain -n IOPMrootDomain | grep "\\\"ExternalMedia\\\"" | awk '{print $4}' | tr -d '\\n'`;
      const powerValue = execSync(powerAssertCommand).toString();
      if (powerValue === 'Yes') {
        execSync('sudo pmset -a autopoweroff 0').toString();
      }
      
      // 3. Try to identify the specific USB port and disable it
      const portIdentifyCommand = `system_profiler SPUSBDataType | grep -B 10 -A 20 "Vendor ID: 0x${device.vendorId.toString(16)}" | grep -B 10 -A 10 "Product ID: 0x${device.productId.toString(16)}" | grep "Location ID:" | head -n 1`;
      const portInfo = execSync(portIdentifyCommand).toString();
      if (portInfo) {
        const match = portInfo.match(/Location ID:\s+(0x[0-9a-f]+)/i);
        if (match && match[1]) {
          const locationId = match[1];
          console.log(`Found charging device at location ID: ${locationId}`);
          
          // Try to manipulate power delivery for that specific port
          execSync(`sudo ioreg -r -c AppleUSBDevice | grep -A 20 "${locationId}" | grep "IOPowerManagement" -A 5`).toString();
        }
      }
      
      console.log('Applied multiple blocking methods for charging cable');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error blocking charging cable:', error);
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

  console.log(`Blocking device: ${device.vendorId}:${device.productId} (Class: ${deviceClass})`);
  const isChargingCable = await blockChargingCable(device);
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
    isChargingCable,
    status: "blocked",
    date: new Date().toISOString(),
    id: Date.now()
  };
  blockedAttempts.unshift(deviceInfo);
  writeDataFile(blockedAttemptsPath, blockedAttempts);

  const logs = readDataFile(logsPath);
  const logEntry = {
    action: 'Block Attempt',
    device: `${deviceInfo.manufacturer || 'Unknown'} ${deviceInfo.description || 'Device'} (${deviceInfo.vendorId}:${deviceInfo.productId})`,
    deviceClass,
    deviceType: isChargingCable ? 'Charging Cable' : 'Standard Device',
    status: "blocked",
    date: new Date().toISOString(),
    id: Date.now()
  };
  logs.unshift(logEntry);
  writeDataFile(logsPath, logs);

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
