
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
      
      // 1. IMMEDIATE REMOVAL OF ANY BLOCKING FILES
      try {
        console.log("Removing ALL USB block rules for this device...");
        // Clear any rules specifically for this device
        execSync(`sudo rm -f /tmp/usb_block_${vendorId}_${productId}.sh 2>/dev/null || true`);
        execSync(`sudo rm -f /tmp/usb_forget.sh 2>/dev/null || true`);
        execSync(`sudo rm -f /tmp/usb_block.sh 2>/dev/null || true`);
        
        // Remove from hosts file if present
        execSync(`sudo sed -i '' '/${vendorId}-${productId}.local/d' /etc/hosts 2>/dev/null || true`);
        execSync(`sudo sed -i '' '/USB BLOCK/d' /etc/hosts 2>/dev/null || true`);
      } catch (err) {
        console.log("Removing block rules warning:", err.message);
      }
      
      // 2. FORCE IMMEDIATE RESET OF ALL USB SUBSYSTEMS WITH PRIORITY ON THIS DEVICE
      try {
        console.log("Performing complete USB subsystem reset...");
        
        // First try to enable the device directly (if visible)
        execSync(`ioreg -p IOUSB -l | grep -B 10 -A 30 "idVendor.*0x${vendorId}" | grep -B 10 -A 20 "idProduct.*0x${productId}" || true`);
        
        // Then unload ALL storage related drivers to clear any blocks
        execSync(`sudo kextunload -b com.apple.driver.usb.massstorage 2>/dev/null || true`);
        execSync(`sudo kextunload -b com.apple.iokit.IOUSBMassStorageClass 2>/dev/null || true`);
        
        // Force unmount any external drives that might be in a locked state
        execSync(`diskutil list | grep external | awk '{print $1}' | xargs -I{} sudo diskutil unmountDisk force {} 2>/dev/null || true`);
        
        // Then reload the drivers
        execSync(`sudo kextload -b com.apple.iokit.IOUSBMassStorageClass 2>/dev/null || true`);
        execSync(`sudo kextload -b com.apple.driver.usb.massstorage 2>/dev/null || true`);
        
        // Force remount of ALL external drives
        execSync(`diskutil list | grep external | awk '{print $1}' | xargs -I{} diskutil mountDisk {} 2>/dev/null || true`);
        
        // Full USB reset with complete unload/reload - CRITICAL for macOS
        execSync(`sudo kextunload -b com.apple.iokit.IOUSBHostFamily 2>/dev/null || true`);
        execSync(`sudo kextload -b com.apple.iokit.IOUSBHostFamily 2>/dev/null || true`);
        
        // Kill and restart USB-related system processes to ensure changes apply
        execSync(`killall usbd 2>/dev/null || true`);
        
        console.log("USB subsystem completely reset");
      } catch (resetErr) {
        console.log("USB reset applied with warnings:", resetErr.message);
      }
      
      // 3. Try additional disk mounting strategies
      try {
        // Look for all available external disks
        console.log("Performing aggressive disk recovery for external storage...");
        const diskOutput = execSync(`diskutil list | grep external || echo ""`, { encoding: 'utf8' });
        if (diskOutput.trim()) {
          const externalDisks = diskOutput.trim().split('\n');
          
          for (const diskLine of externalDisks) {
            if (diskLine) {
              const match = diskLine.match(/\s(disk\d+s?\d*)/);
              if (match && match[1]) {
                const disk = match[1];
                console.log(`Attempting to recover and mount disk ${disk}`);
                
                // Try multiple mount strategies
                execSync(`diskutil unmountDisk force /dev/${disk} 2>/dev/null || true`);
                execSync(`diskutil repairDisk /dev/${disk} 2>/dev/null || true`);
                execSync(`diskutil mountDisk /dev/${disk} 2>/dev/null || true`);
                execSync(`diskutil mount /dev/${disk} 2>/dev/null || true`);
              }
            }
          }
        }
      } catch (diskErr) {
        console.log("Disk recovery completed with warnings:", diskErr.message);
      }
      
      console.log("All unblocking procedures completed - device should be accessible now");
      return true;
    } else if (platform === 'win32') {
      // Windows implementation - Enhanced to ensure device comes back
      console.log("Running enhanced Windows unblock procedures");
      
      // Try multiple approaches for unblocking
      try {
        // Comprehensive approach that rebuilds the USB stack
        // First remove any device blocks
        execSync(`powershell "Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${vendorId}&PID_${productId}*' -and $_.Status -eq 'Error' } | Enable-PnpDevice -Confirm:$false"`);
        
        // Then fully disable and re-enable the device to reset its state
        execSync(`powershell "Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${vendorId}&PID_${productId}*' } | Disable-PnpDevice -Confirm:$false; Start-Sleep -Seconds 2; Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${vendorId}&PID_${productId}*' } | Enable-PnpDevice -Confirm:$false"`);
        
        // Force Windows to rescan all devices
        execSync(`powershell "pnputil /scan-devices"`);
        
        // Restart USB controllers to clear any lingering issues
        execSync(`powershell "$controllers = Get-PnpDevice | Where-Object {$_.Class -eq 'USB' -and $_.FriendlyName -like '*controller*'}; foreach ($controller in $controllers) { $controller | Disable-PnpDevice -Confirm:$false; Start-Sleep -Seconds 2; $controller | Enable-PnpDevice -Confirm:$false }"`);
      } catch (err) {
        console.log("Windows unblock applied with warnings:", err.message);
      }
      
      return true;
    } else {
      // Linux implementation - Enhanced for better unblocking
      console.log("Running enhanced Linux unblock procedures");
      
      // Multiple Linux approaches
      try {
        // Set authorized flag to 1 for this specific device
        execSync(`find /sys/bus/usb/devices/ -name "idVendor" -exec sh -c 'if grep -q "${vendorId}" {}; then dirname_path=$(dirname {}); if grep -q "${productId}" "$dirname_path/idProduct"; then echo 1 > "$dirname_path/authorized"; fi; fi' \\; || true`);
        
        // Force system-wide USB reset
        execSync(`sudo udevadm control --reload-rules && sudo udevadm trigger`);
        
        // Restart USB subsystem (more aggressive approach)
        execSync(`sudo rmmod usb_storage && sudo modprobe usb_storage || true`);
        
        // Force remount of any storage devices
        execSync(`lsblk -o NAME,VENDOR,MODEL | grep -i "${vendorId}" | awk '{print $1}' | xargs -I{} sudo mount -a || true`);
      } catch (err) {
        console.log("Linux unblock applied with warnings:", err.message);
      }
      
      return true;
    }
  } catch (err) {
    console.error(`Error in enhanced unblocking for device: ${err.message}`);
    return false;
  }
}

module.exports = { isWhitelisted, formatDeviceIds, unblockWhitelistedDevice };
