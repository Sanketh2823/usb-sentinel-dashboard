/**
 * Helper to check if a USB device is whitelisted.
 * @param {object} device
 * @param {Array} whitelistedDevices
 * @returns {boolean}
 */
function isWhitelisted(device, whitelistedDevices) {
  // Convert vendorId and productId to lowercase hex string for consistent comparison
  const deviceVendorId = device.vendorId.toString(16).padStart(4, "0").toLowerCase();
  const deviceProductId = device.productId.toString(16).padStart(4, "0").toLowerCase();
  
  // Enhanced logging to help debug whitelist issues
  console.log(`Checking whitelist for device: ${deviceVendorId}:${deviceProductId}`);
  console.log(`Number of whitelisted devices: ${whitelistedDevices.length}`);
  
  // More strict whitelist checking
  const isInWhitelist = whitelistedDevices.some(
    (d) => {
      const whitelistedVendorId = d.vendorId.toLowerCase();
      const whitelistedProductId = d.productId.toLowerCase();
      const isMatch = whitelistedVendorId === deviceVendorId && 
                     whitelistedProductId === deviceProductId;
      
      if (isMatch) {
        console.log(`Found whitelist match: ${d.name || 'Unknown device'}`);
      }
      
      return isMatch;
    }
  );
  
  // Log whitelist decision for debugging
  if (!isInWhitelist) {
    console.log(`Device ${deviceVendorId}:${deviceProductId} is NOT in whitelist`);
  } else {
    console.log(`Device ${deviceVendorId}:${deviceProductId} IS in whitelist and should be allowed`);
  }
  
  return isInWhitelist;
}

/**
 * Helper to format device identifiers for consistent display and storage
 * @param {object} device 
 * @returns {object} Formatted device with consistent ID formats
 */
function formatDeviceIds(device) {
  // Ensure consistent hex format for vendorId and productId
  const formattedDevice = {...device};
  
  if (formattedDevice.vendorId) {
    // Convert number to padded lowercase hex string
    if (typeof formattedDevice.vendorId === 'number') {
      formattedDevice.vendorId = formattedDevice.vendorId.toString(16).padStart(4, "0").toLowerCase();
    } 
    // Ensure string is properly formatted
    else if (typeof formattedDevice.vendorId === 'string') {
      // Remove 0x prefix if present
      formattedDevice.vendorId = formattedDevice.vendorId.replace(/^0x/i, '').padStart(4, "0").toLowerCase();
    }
  }
  
  if (formattedDevice.productId) {
    // Convert number to padded lowercase hex string
    if (typeof formattedDevice.productId === 'number') {
      formattedDevice.productId = formattedDevice.productId.toString(16).padStart(4, "0").toLowerCase();
    } 
    // Ensure string is properly formatted
    else if (typeof formattedDevice.productId === 'string') {
      // Remove 0x prefix if present
      formattedDevice.productId = formattedDevice.productId.replace(/^0x/i, '').padStart(4, "0").toLowerCase();
    }
  }
  
  return formattedDevice;
}

/**
 * Helper function to unblock and remount a previously blocked USB device
 * @param {object} device - Device with vendorId and productId
 * @returns {Promise<boolean>} - Whether the unblocking was successful
 */
const unblockWhitelistedDevice = async (device) => {
  const platform = require('os').platform();
  const { execSync } = require('child_process');
  const { formatDeviceIds } = require('./whitelist');
  
  // Ensure consistent formatting of device IDs
  const formattedDevice = formatDeviceIds(device);
  const vendorId = formattedDevice.vendorId;
  const productId = formattedDevice.productId;
  
  console.log(`Executing aggressive unblock for device: ${vendorId}:${productId}`);
  
  try {
    if (platform === 'darwin') {
      // macOS: enhanced multi-step unblocking
      console.log("Performing macOS-specific advanced unblocking");
      
      // 1. Clean up any device-specific blocking scripts
      try {
        execSync(`sudo rm -f /tmp/usb_block_${vendorId}_${productId}.sh 2>/dev/null || true`);
      } catch (err) {
        console.log("No device-specific block script found (this is normal)");
      }
      
      // 2. Unload any class-specific kexts that might be interfering
      try {
        execSync("sudo kextload -b com.apple.driver.usb.massstorage 2>/dev/null || true");
        execSync("sudo kextload -b com.apple.iokit.IOUSBMassStorageClass 2>/dev/null || true");
      } catch (err) {
        console.log("Kext loading error (non-critical):", err.message);
      }
      
      // 3. Remove any permanent blocking files
      try {
        execSync("sudo launchctl unload /Library/LaunchDaemons/com.usbmonitor.blockusb.plist 2>/dev/null || true");
        execSync("sudo launchctl unload /Library/LaunchDaemons/com.usbmonitor.enhanced.plist 2>/dev/null || true");
        execSync("sudo rm -f /Library/LaunchDaemons/com.usbmonitor.blockusb.plist 2>/dev/null || true");
        execSync("sudo rm -f /Library/LaunchDaemons/com.usbmonitor.enhanced.plist 2>/dev/null || true");
      } catch (err) {
        console.log("LaunchDaemon removal error (non-critical):", err.message);
      }
      
      // 4. Try to reset USB subsystem (careful approach)
      try {
        // Unload and reload USB subsystem if possible
        execSync("sudo kextunload -b com.apple.iokit.IOUSBHostFamily 2>/dev/null || true");
        setTimeout(() => {
          try {
            execSync("sudo kextload -b com.apple.iokit.IOUSBHostFamily 2>/dev/null || true");
          } catch (e) {
            console.log("USB subsystem reload error (non-critical):", e.message);
          }
        }, 1000);
      } catch (err) {
        console.log("USB subsystem reset error (non-critical):", err.message);
      }
      
      // 5. Try diskutil reset if it's a storage device
      try {
        const { stdout: deviceInfo } = await require('util').promisify(require('child_process').exec)(
          `system_profiler SPUSBDataType | grep -B 10 -A 30 "Vendor ID: 0x${vendorId}" | grep -B 10 -A 30 "Product ID: 0x${productId}"`
        );
        
        if (deviceInfo.includes("BSD Name:")) {
          const bsdMatch = deviceInfo.match(/BSD Name:\s+(\w+)/);
          if (bsdMatch && bsdMatch[1]) {
            try {
              execSync(`diskutil mount /dev/${bsdMatch[1]} 2>/dev/null || true`);
              console.log(`Attempted to mount disk: ${bsdMatch[1]}`);
            } catch (mountErr) {
              console.log("Mount error (non-critical):", mountErr.message);
            }
          }
        }
      } catch (diskErr) {
        console.log("Disk detection error (non-critical):", diskErr.message);
      }
      
    } else if (platform === 'win32') {
      // Windows implementation
      console.log("Performing Windows-specific unblocking");
      try {
        execSync(`powershell "Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${vendorId}&PID_${productId}*' } | Enable-PnpDevice -Confirm:$false"`);
      } catch (err) {
        console.log("Windows unblock error (non-critical):", err.message);
      }
      
    } else {
      // Linux implementation
      console.log("Performing Linux-specific unblocking");
      try {
        execSync(`echo 1 > /sys/bus/usb/devices/$(lsusb -d ${vendorId}:${productId} | cut -d: -f1 | cut -d' ' -f2)-$(lsusb -d ${vendorId}:${productId} | cut -d: -f2 | cut -d' ' -f1)/authorized`);
      } catch (err) {
        console.log("Linux unblock error (non-critical):", err.message);
      }
    }
    
    console.log(`Aggressive unblock for ${vendorId}:${productId} completed`);
    return true;
  } catch (error) {
    console.error(`Error during aggressive unblock: ${error.message}`);
    return false;
  }
};

module.exports = {
  isWhitelisted,
  formatDeviceIds,
  unblockWhitelistedDevice,
};
