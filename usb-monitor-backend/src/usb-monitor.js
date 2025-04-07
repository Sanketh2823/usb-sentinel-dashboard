
const { getDeviceClass } = require('./utils/device');
const { readDataFile, writeDataFile, whitelistPath, blockedAttemptsPath, logsPath } = require('./config');
const { blockUSBDevice } = require('./controllers/usb');

// USB device insertion handler
const setupUsbMonitor = (usbDetect, broadcastUpdate) => {
  // Initialize USB detection
  usbDetect.startMonitoring();

  // USB device insertion handler
  usbDetect.on('add', async (device) => {
    console.log(`USB device connected: ${device.vendorId}:${device.productId}`);
    
    try {
      const whitelistedDevices = readDataFile(whitelistPath);
      const allowedClasses = readDataFile(allowedClassesPath);
      
      // Check if device is in whitelist
      const isWhitelisted = whitelistedDevices.some(
        (d) => d.vendorId === device.vendorId.toString(16) && d.productId === device.productId.toString(16)
      );
      
      if (!isWhitelisted) {
        // Get device class
        const deviceClass = await getDeviceClass(
          device.vendorId.toString(16),
          device.productId.toString(16)
        );
        
        // Check if class is allowed
        const isClassAllowed = allowedClasses.some(
          (c) => c.id.toLowerCase() === deviceClass.toLowerCase()
        );
        
        if (!isClassAllowed) {
          console.log(`Blocking non-whitelisted device: ${device.vendorId}:${device.productId} (Class: ${deviceClass})`);
          
          // Block the device
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
            date: new Date().toISOString(),
            id: Date.now()
          };
          blockedAttempts.unshift(deviceInfo);
          writeDataFile(blockedAttemptsPath, blockedAttempts);
          
          // Log the blocked attempt
          const logs = readDataFile(logsPath);
          const logEntry = {
            action: 'Block Attempt',
            device: `${deviceInfo.manufacturer || 'Unknown'} ${deviceInfo.description || 'Device'} (${deviceInfo.vendorId}:${deviceInfo.productId})`,
            deviceClass,
            date: new Date().toISOString(),
            id: Date.now()
          };
          logs.unshift(logEntry);
          writeDataFile(logsPath, logs);
          
          // Broadcast the updates
          broadcastUpdate({
            blockedAttemptsUpdate: blockedAttempts,
            newLog: logEntry
          });
        } else {
          console.log(`Allowing device with permitted class: ${deviceClass}`);
        }
      } else {
        console.log(`Whitelisted device connected: ${device.vendorId}:${device.productId}`);
      }
    } catch (error) {
      console.error('Error handling USB device connection:', error);
    }
  });

  // USB device removal handler
  usbDetect.on('remove', (device) => {
    console.log(`USB device disconnected: ${device.vendorId}:${device.productId}`);
  });
};

module.exports = setupUsbMonitor;
