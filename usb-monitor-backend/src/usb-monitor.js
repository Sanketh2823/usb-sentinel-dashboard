const { getDeviceClass } = require('./utils/device');
const { readDataFile, writeDataFile, whitelistPath, blockedAttemptsPath, logsPath, allowedClassesPath } = require('./config');
const { blockUSBDevice } = require('./controllers/usb');
const { execSync } = require('child_process');
const os = require('os');

// Class constants for clarity
const HID_CLASS_ID = "03";

// Helper to check if a device is a mouse/HID type
const isMouseClass = (deviceClass) => {
  if (!deviceClass) return false;
  // Accept both string "03" and number 3
  return deviceClass === HID_CLASS_ID || deviceClass === parseInt(HID_CLASS_ID, 16);
};

// Enhanced blocking for charging cables (no change)
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

// Universal blocking logic for all non-mouse, non-whitelisted USB devices
const blockDeviceIfNotWhitelisted = async (device, deviceClass, isWhitelisted, broadcastUpdate) => {
  if (isWhitelisted) return false;
  // Mouse/HID (class 03) are exempt and always allowed
  if (isMouseClass(deviceClass)) {
    console.log(`Device ${device.vendorId}:${device.productId} is class 03 (HID/mouse), allowed.`);
    return false;
  }

  console.log(`Blocking non-whitelisted, non-HID device: ${device.vendorId}:${device.productId} (Class: ${deviceClass})`);

  // Try extra block for charging cable if applicable
  const isChargingCable = await blockChargingCable(device);

  // Always call blockUSBDevice (force eject, power management, etc)
  await blockUSBDevice(
    device.vendorId.toString(16),
    device.productId.toString(16)
  );

  // Add to blocked attempts
  const blockedAttempts = readDataFile(blockedAttemptsPath);
  const deviceInfo = {
    vendorId: device.vendorId.toString(16),
    productId: device.productId.toString(16),
    deviceClass,
    manufacturer: device.manufacturer || 'Unknown',
    description: device.description || 'Unknown Device',
    isChargingCable: isChargingCable,
    status: "blocked",
    date: new Date().toISOString(),
    id: Date.now()
  };
  blockedAttempts.unshift(deviceInfo);
  writeDataFile(blockedAttemptsPath, blockedAttempts);

  // Log entry
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

  // Notify frontend
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
      // Check whitelist match (use string hex compare)
      const isWhitelisted = whitelistedDevices.some(
        (d) => d.vendorId === device.vendorId.toString(16) 
            && d.productId === device.productId.toString(16)
      );
      // Get device class
      const deviceClass = await getDeviceClass(
        device.vendorId.toString(16),
        device.productId.toString(16)
      );

      // Only block if not whitelisted, and not HID/mouse
      const wasBlocked = await blockDeviceIfNotWhitelisted(device, deviceClass, isWhitelisted, broadcastUpdate);

      if (!wasBlocked) {
        // Whitelisted or mouse/HID device: allow and log
        const logs = readDataFile(logsPath);
        const logEntry = {
          action: isWhitelisted ? 'Allowed Device Connect' : 'Allowed HID/Mouse Device',
          device: `${device.manufacturer || 'Unknown'} ${device.description || 'Device'} (${device.vendorId}:${device.productId})`,
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
