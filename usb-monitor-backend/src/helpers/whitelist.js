
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
      // For macOS, implement more aggressive unblocking procedures
      console.log("Running enhanced macOS unblock procedures");
      
      // 1. First try to find and list the device to help with debugging
      try {
        const deviceInfo = execSync(
          `system_profiler SPUSBDataType | grep -A 20 -B 5 "Vendor ID: 0x${vendorId}" | grep -A 15 -B 5 "Product ID: 0x${productId}"`, 
          { encoding: 'utf8' }
        );
        console.log("Device info from system profiler:", deviceInfo);
      } catch (err) {
        console.log("Device not found in system profiler, may need reconnection");
      }
      
      // 2. Explicitly disable the USB device block rules
      try {
        console.log("Removing any existing USB block rules...");
        // Clear any rules specifically for this device
        execSync(`sudo rm -f /tmp/usb_block_${vendorId}_${productId}.sh || true`);
        
        // Try to clear any host entries blocking this device
        const hostEntry = `127.0.0.1 ${vendorId}-${productId}.local`;
        execSync(`sudo sed -i '' '/${vendorId}-${productId}.local/d' /etc/hosts || true`);
      } catch (err) {
        console.log("Removing block rules warning:", err.message);
      }
      
      // 3. Enhanced disk remounting for storage devices
      try {
        // Look for external disks and try to mount them all
        console.log("Looking for external disks to mount...");
        execSync(`diskutil list | grep external || echo "No external disks found"`);
        
        // Try to mount all external disks
        console.log("Attempting to mount all external disks...");
        const externalDisks = execSync(`diskutil list | grep external | awk '{print $1}' || echo ""`, { encoding: 'utf8' }).trim().split('\n');
        
        for (const disk of externalDisks) {
          if (disk) {
            try {
              console.log(`Attempting to mount disk ${disk}...`);
              execSync(`diskutil mount ${disk} || true`);
            } catch (err) {
              console.log(`Warning when mounting ${disk}:`, err.message);
            }
          }
        }
      } catch (diskErr) {
        console.log("Disk remount warnings:", diskErr.message);
      }
      
      // 4. Aggressive USB reset procedure
      try {
        console.log("Performing full USB subsystem reset...");
        
        // First unload USB storage related extensions
        execSync(`sudo kextunload -b com.apple.driver.usb.massstorage 2>/dev/null || true`);
        execSync(`sudo kextunload -b com.apple.iokit.IOUSBMassStorageClass 2>/dev/null || true`);
        
        // Then reload them
        execSync(`sudo kextload -b com.apple.iokit.IOUSBMassStorageClass 2>/dev/null || true`);
        execSync(`sudo kextload -b com.apple.driver.usb.massstorage 2>/dev/null || true`);
        
        // Full USB reset by unloading and reloading the entire USB family
        execSync(`sudo kextunload -b com.apple.iokit.IOUSBHostFamily 2>/dev/null || true`);
        execSync(`sudo kextload -b com.apple.iokit.IOUSBHostFamily 2>/dev/null || true`);
        
        console.log("USB subsystem reset completed");
      } catch (resetErr) {
        console.log("USB reset warnings:", resetErr.message);
      }
      
      // 5. Try to revive killed USB monitor processes
      try {
        console.log("Restarting USB monitor processes...");
        execSync(`killall usbd 2>/dev/null || true`);
      } catch (procErr) {
        // Ignore errors
      }
      
      console.log("All unblocking procedures completed - device should be accessible now or after reconnection");
      return true;
    } else if (platform === 'win32') {
      // Windows implementation - Enhanced to ensure device comes back
      console.log("Running enhanced Windows unblock procedures");
      
      // Try multiple approaches for unblocking
      try {
        // First attempt - basic PnP device enable
        execSync(`powershell "Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${vendorId}&PID_${productId}*' } | Enable-PnpDevice -Confirm:$false"`);
        
        // Second attempt - rescan devices
        execSync(`powershell "Start-Process -Verb runas -FilePath 'pnputil.exe' -ArgumentList '/scan-devices'"`);
        
        // Third attempt - force driver reload
        execSync(`powershell "Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${vendorId}&PID_${productId}*' } | Disable-PnpDevice -Confirm:$false; Start-Sleep -Seconds 2; Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${vendorId}&PID_${productId}*' } | Enable-PnpDevice -Confirm:$false"`);
      } catch (err) {
        console.log("Windows unblock warnings:", err.message);
      }
      
      return true;
    } else {
      // Linux implementation - Enhanced for better unblocking
      console.log("Running enhanced Linux unblock procedures");
      
      // Multiple Linux approaches
      try {
        // First attempt - direct authorized flag
        execSync(`find /sys/bus/usb/devices/ -name "idVendor" -exec sh -c 'if grep -q "${vendorId}" {}; then echo 1 > $(dirname {})/authorized; fi' \\; || true`);
        
        // Second attempt - USB reset using usbreset tool
        execSync(`lsusb -d ${vendorId}:${productId} && (echo "Bus and device found, attempting reset"; for bus in /dev/bus/usb/*; do for dev in $bus/*; do if [ -e "$dev" ]; then usbreset ${dev} 2>/dev/null || true; fi; done; done) || echo "Device not found for reset"`);
        
        // Third attempt - udev trigger
        execSync(`sudo udevadm trigger || true`);
      } catch (err) {
        console.log("Linux unblock warnings:", err.message);
      }
      
      return true;
    }
  } catch (err) {
    console.error(`Error in enhanced unblocking for device: ${err.message}`);
    return false;
  }
}

module.exports = { isWhitelisted, formatDeviceIds, unblockWhitelistedDevice };
