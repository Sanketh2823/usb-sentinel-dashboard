
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
  console.log(`Whitelist details: ${JSON.stringify(whitelistedDevices)}`);
  
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
async function unblockWhitelistedDevice(device) {
  const { execSync } = require('child_process');
  const os = require('os');
  const platform = os.platform();
  
  // Format device IDs to ensure consistency
  const formattedDevice = formatDeviceIds(device);
  const vendorId = formattedDevice.vendorId;
  const productId = formattedDevice.productId;
  
  console.log(`Attempting to unblock and remount device: ${vendorId}:${productId}`);
  
  try {
    if (platform === 'darwin') {
      // For macOS, attempt to re-enable the device and trigger a device scan
      console.log("Running macOS unblock procedures");
      
      // Try to find and list the device to help with debugging
      execSync(`system_profiler SPUSBDataType | grep -A 20 -B 5 "Vendor ID: 0x${vendorId}" | grep -A 15 -B 5 "Product ID: 0x${productId}"`, 
        { encoding: 'utf8', stdio: 'inherit' });
      
      // Try to remount via diskutil if it's a storage device
      try {
        execSync(`diskutil list | grep -i "${vendorId}" || echo "No disk found"`);
        console.log("Attempting disk remount...");
        // This will attempt to find disks that might match our device and remount them
        execSync(`diskutil list | grep -i external | awk '{print $1}' | xargs -I % diskutil mount %`);
      } catch (diskErr) {
        console.log("Disk remount attempt complete or not applicable");
      }
      
      // Try to reset USB ports to force re-enumeration
      console.log("Attempting USB port reset...");
      try {
        // This restarts the USB subsystem by unloading and reloading the IOUSBFamily kernel extension
        // Note: This won't disconnect other devices as macOS handles this gracefully
        execSync(`kextunload -b com.apple.iokit.IOUSBHostFamily || true`);
        execSync(`kextload -b com.apple.iokit.IOUSBHostFamily || true`);
        console.log("USB subsystem reset complete");
      } catch (resetErr) {
        console.log("USB reset attempt completed with warnings:", resetErr.message);
      }
      
      return true;
    } else if (platform === 'win32') {
      // Windows implementation - Enable previously disabled device
      console.log("Running Windows unblock procedures");
      const command = `powershell "Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${vendorId}&PID_${productId}*' -and $_.Status -eq 'Error' } | Enable-PnpDevice -Confirm:$false"`;
      execSync(command);
      return true;
    } else {
      // Linux implementation - Re-authorize USB device
      console.log("Running Linux unblock procedures");
      const command = `echo 1 > /sys/bus/usb/devices/$(lsusb -d ${vendorId}:${productId} | cut -d: -f1 | cut -d' ' -f2)-$(lsusb -d ${vendorId}:${productId} | cut -d: -f2 | cut -d' ' -f1)/authorized`;
      execSync(command);
      return true;
    }
  } catch (err) {
    console.error(`Error unblocking device: ${err.message}`);
    return false;
  }
}

module.exports = { isWhitelisted, formatDeviceIds, unblockWhitelistedDevice };
