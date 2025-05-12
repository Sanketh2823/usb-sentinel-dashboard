
const { readDataFile, writeDataFile, whitelistPath } = require('../config');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

// Format device IDs consistently
const formatDeviceIds = (device) => {
  let vendorId = device.vendorId;
  let productId = device.productId;

  // Handle numeric IDs
  if (typeof vendorId === 'number') {
    vendorId = vendorId.toString(16).padStart(4, '0').toLowerCase();
  }
  // Handle string IDs with or without 0x prefix
  else if (typeof vendorId === 'string') {
    vendorId = vendorId.replace(/^0x/i, '').padStart(4, '0').toLowerCase();
  }

  if (typeof productId === 'number') {
    productId = productId.toString(16).padStart(4, '0').toLowerCase();
  }
  else if (typeof productId === 'string') {
    productId = productId.replace(/^0x/i, '').padStart(4, '0').toLowerCase();
  }

  return { vendorId, productId };
};

// Check if a device is whitelisted
const isWhitelisted = (device, whitelistedDevices) => {
  if (!device || !whitelistedDevices) return false;
  
  const { vendorId, productId } = formatDeviceIds(device);
  console.log(`Checking if device ${vendorId}:${productId} is whitelisted`);
  
  const isInWhitelist = whitelistedDevices.some(d => {
    const whitelistedVendorId = d.vendorId.replace(/^0x/i, '').toLowerCase();
    const whitelistedProductId = d.productId.replace(/^0x/i, '').toLowerCase();
    
    const match = whitelistedVendorId === vendorId && whitelistedProductId === productId;
    if (match) {
      console.log(`MATCH FOUND! Device ${vendorId}:${productId} is whitelisted`);
    }
    return match;
  });
  
  return isInWhitelist;
};

// Unblock a device that is on the whitelist (multi-platform)
const unblockWhitelistedDevice = async (device) => {
  console.log(`Attempting to unblock whitelisted device ${device.vendorId}:${device.productId}`);
  
  const normalizedDevice = formatDeviceIds(device);
  const platform = os.platform();
  
  if (platform === 'darwin') {
    try {
      // 1. Try to reload USB mass storage drivers if they were unloaded
      console.log("Reloading USB mass storage drivers...");
      execSync(`sudo kextload -b com.apple.driver.usb.massstorage 2>/dev/null || true`);
      execSync(`sudo kextload -b com.apple.iokit.IOUSBMassStorageClass 2>/dev/null || true`);
      
      // 2. Try to cleanup any blocking rules specific to this device
      const vendorHex = normalizedDevice.vendorId;
      const productHex = normalizedDevice.productId;
      
      // Remove any device-specific block scripts
      console.log(`Removing any device-specific block scripts for ${vendorHex}:${productHex}...`);
      const blockScriptPath = `/tmp/usb_block_${vendorHex}_${productHex}.sh`;
      if (fs.existsSync(blockScriptPath)) {
        execSync(`sudo rm -f ${blockScriptPath}`);
      }
      
      // 3. Force a USB subsystem refresh
      console.log("Forcing USB subsystem refresh...");
      
      // Ensure we're not creating permanent blocking agents
      execSync(`sudo launchctl unload /Library/LaunchDaemons/com.usbmonitor.blockusb.plist 2>/dev/null || true`);
      execSync(`sudo launchctl unload /Library/LaunchDaemons/com.usbmonitor.enhanced.plist 2>/dev/null || true`);
      
      // Attempt to kill any blocking processes that might be running
      execSync(`sudo pkill -f "enhanced-block-usb-storage.sh" 2>/dev/null || true`);
      
      // Mark the whitelist status as "allowed"
      const whitelistedDevices = readDataFile(whitelistPath);
      const existingDeviceIndex = whitelistedDevices.findIndex(
        d => d.vendorId.toLowerCase() === normalizedDevice.vendorId && 
             d.productId.toLowerCase() === normalizedDevice.productId
      );
      
      if (existingDeviceIndex >= 0) {
        whitelistedDevices[existingDeviceIndex].status = "allowed";
        writeDataFile(whitelistPath, whitelistedDevices);
        console.log("Updated whitelist device status to 'allowed'");
      }
      
      console.log(`Successfully unblocked device: ${vendorHex}:${productHex}`);
      return true;
    } catch (error) {
      console.error(`Error unblocking whitelisted device: ${error.message}`);
      return false;
    }
  } else if (platform === 'win32') {
    try {
      // Import and use the Windows controller to unblock the device
      const windowsController = require('../controllers/windows');
      
      if (windowsController) {
        const result = await windowsController.unblockUsbDeviceOnWindows(
          normalizedDevice.vendorId,
          normalizedDevice.productId
        );
        
        // Mark the whitelist status as "allowed"
        const whitelistedDevices = readDataFile(whitelistPath);
        const existingDeviceIndex = whitelistedDevices.findIndex(
          d => d.vendorId.toLowerCase() === normalizedDevice.vendorId && 
               d.productId.toLowerCase() === normalizedDevice.productId
        );
        
        if (existingDeviceIndex >= 0) {
          whitelistedDevices[existingDeviceIndex].status = "allowed";
          writeDataFile(whitelistPath, whitelistedDevices);
          console.log("Updated whitelist device status to 'allowed'");
        }
        
        console.log(`Windows unblock result: ${JSON.stringify(result)}`);
        return result.success;
      }
      
      console.log("Windows controller not available");
      return false;
    } catch (error) {
      console.error(`Error unblocking whitelisted device on Windows: ${error.message}`);
      return false;
    }
  } else if (platform === 'linux') {
    try {
      // Import and use the Linux controller to unblock the device
      const linuxController = require('../controllers/linux');
      
      if (linuxController) {
        const result = await linuxController.unblockUsbDeviceOnLinux(
          normalizedDevice.vendorId,
          normalizedDevice.productId
        );
        
        // Mark the whitelist status as "allowed"
        const whitelistedDevices = readDataFile(whitelistPath);
        const existingDeviceIndex = whitelistedDevices.findIndex(
          d => d.vendorId.toLowerCase() === normalizedDevice.vendorId && 
               d.productId.toLowerCase() === normalizedDevice.productId
        );
        
        if (existingDeviceIndex >= 0) {
          whitelistedDevices[existingDeviceIndex].status = "allowed";
          writeDataFile(whitelistPath, whitelistedDevices);
          console.log("Updated whitelist device status to 'allowed'");
        }
        
        console.log(`Linux unblock result: ${JSON.stringify(result)}`);
        return result.success;
      }
      
      console.log("Linux controller not available");
      return false;
    } catch (error) {
      console.error(`Error unblocking whitelisted device on Linux: ${error.message}`);
      return false;
    }
  } else {
    console.log(`Unblocking not implemented for platform ${platform} yet`);
    return false;
  }
};

module.exports = {
  isWhitelisted,
  formatDeviceIds,
  unblockWhitelistedDevice
};
