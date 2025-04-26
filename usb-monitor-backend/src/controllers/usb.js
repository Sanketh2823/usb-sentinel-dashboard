const os = require('os');
const { exec } = require('child_process');
const { getDeviceClass } = require('../utils/device');
const { execPromise } = require('../utils/system');
const { blockSpecificUsbDeviceOnMacOS, blockUsbClassOnMacOS } = require('./macos');

// Function to block/eject a USB device (macOS: attempt full blocking for any non-whitelisted device)
const blockUSBDevice = async (vendorId, productId) => {
  const platform = os.platform();
  
  // Standardize input for matching kextunload and diskutil calls
  const vendorIdHex = typeof vendorId === 'string' ? vendorId.replace(/^0x/i, '').padStart(4, '0').toLowerCase() : vendorId.toString(16).padStart(4, '0').toLowerCase();
  const productIdHex = typeof productId === 'string' ? productId.replace(/^0x/i, '').padStart(4, '0').toLowerCase() : productId.toString(16).padStart(4, '0').toLowerCase();

  if (platform === 'win32') {
    const command = `powershell "Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${vendorId}&PID_${productId}*' } | Disable-PnpDevice -Confirm:$false"`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error blocking device on Windows: ${error.message}`);
        return false;
      }
      return true;
    });
  } else if (platform === 'darwin') {
    // macOS: attempt storage unmount, class-based kextunload, and aggressive power/port actions
    try {
      // 1. Try to find and unmount the device (if storage)
      const checkCommand = `system_profiler SPUSBDataType | grep -A 20 "Vendor ID: 0x${vendorIdHex}" | grep -A 15 "Product ID: 0x${productIdHex}" | grep "BSD Name:"`;
      exec(checkCommand, (error, stdout, stderr) => {
        if (stdout && stdout.includes("BSD Name:")) {
          // It looks like storage
          const bsdMatch = stdout.match(/BSD Name:\s+(\w+)/);
          if (bsdMatch && bsdMatch[1]) {
            const bsdName = bsdMatch[1];
            const unmountCommand = `diskutil unmountDisk force /dev/${bsdName}`;
            exec(unmountCommand, (error2, stdout2, stderr2) => {
              if (error2) {
                console.error(`Error forcibly unmounting disk: ${error2.message}`);
              } else {
                console.log(`Successfully forcibly unmounted disk: ${bsdName}`);
              }
            });
          }
        } else {
          // Not storage, keep going
          // 2. Try aggressive class-based blocking for everything that's not allowed
          getDeviceClass(vendorIdHex, productIdHex).then(async (deviceClass) => {
            // Unload class driver (even for non-storage, to be safe)
            if (deviceClass) {
              await blockUsbClassOnMacOS(deviceClass);
            }
            // 3. Attempt force block using IOKit/power tricks (even for charge cables)
            // Try to block the device on its port, if possible (location-based)
            const usbInfoCmd = `system_profiler SPUSBDataType | grep -B 10 -A 30 "Vendor ID: 0x${vendorIdHex}" | grep -B 10 -A 30 "Product ID: 0x${productIdHex}"`;
            execPromise(usbInfoCmd).then(({ stdout: portInfo }) => {
              if (portInfo && portInfo.includes("Location ID:")) {
                const loc = portInfo.match(/Location ID:\s+(0x[0-9a-fA-F]+)/);
                if (loc && loc[1]) {
                  const locationId = loc[1];
                  const disableCmd = `sudo ioreg -p IOUSB -l -w 0 | grep -A 20 "${locationId}" | grep "IOPowerManagement" -A 5`;
                  exec(disableCmd, (err, so, se) => {
                    if (err) {
                      console.error("Error (force-port) disabling device via IOPowerManagement:", err);
                    } else {
                      console.log("Ran IOPowerManagement disable command for USB device location", locationId);
                    }
                  });
                }
              }
            });
          });
        }
      });
    } catch (err) {
      console.error("Error in macOS device block procedure:", err);
      return false;
    }
    return true;
  } else {
    // Linux - using USB authorization or udev rules
    const command = `echo 0 > /sys/bus/usb/devices/$(lsusb -d ${vendorId}:${productId} | cut -d: -f1 | cut -d' ' -f2)-$(lsusb -d ${vendorId}:${productId} | cut -d: -f2 | cut -d' ' -f1)/authorized`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error blocking device on Linux: ${error.message}`);
        return false;
      }
      return true;
    });
  }
  return true;
};

// Enhanced function to block a USB device using macOS-specific improvements
const forceBlockUSBDevice = async (vendorId, productId) => {
  const platform = os.platform();
  console.log(`Attempting to force block device ${vendorId}:${productId} on ${platform}`);
  
  try {
    if (platform === 'darwin') {
      return await blockSpecificUsbDeviceOnMacOS(vendorId, productId);
    } else if (platform === 'win32') {
      // Windows implementation (existing code)
      const command = `powershell "Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${vendorId}&PID_${productId}*' } | Disable-PnpDevice -Confirm:$false"`;
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error blocking device on Windows: ${error.message}`);
          return false;
        }
        return true;
      });
      return { success: true, message: 'Windows blocking attempted' };
    } else {
      // Linux implementation (existing code)
      const command = `echo 0 > /sys/bus/usb/devices/$(lsusb -d ${vendorId}:${productId} | cut -d: -f1 | cut -d' ' -f2)-$(lsusb -d ${vendorId}:${productId} | cut -d: -f2 | cut -d' ' -f1)/authorized`;
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error blocking device on Linux: ${error.message}`);
          return false;
        }
        return true;
      });
      return { success: true, message: 'Linux blocking attempted' };
    }
  } catch (error) {
    console.error(`Error with force block: ${error.message}`);
    return { success: false, message: error.message };
  }
};

// Modified ejectUSBDevice function with improved macOS support
const ejectUSBDevice = async (vendorId, productId, platform) => {
  let command;
  
  if (platform === 'win32') {
    // Windows - using PowerShell to eject device
    command = "powershell \"$driveEject = New-Object -comObject Shell.Application; $driveEject.Namespace(17).ParseName((Get-WmiObject Win32_DiskDrive | Where-Object { $_.PNPDeviceID -like '*VID_" + vendorId + "&PID_" + productId + "*' } | Get-WmiObject -Query 'ASSOCIATORS OF {$_.} WHERE ResultClass=Win32_DiskPartition' | ForEach-Object { Get-WmiObject -Query 'ASSOCIATORS OF {$_.} WHERE ResultClass=Win32_LogicalDisk' } | Select-Object -First 1 DeviceID).DeviceID).InvokeVerb('Eject')\"";
  } else if (platform === 'darwin') {
    // Improved macOS detection for charging devices
    // First get detailed device info
    try {
      const deviceInfoCommand = "system_profiler SPUSBDataType | grep -B 10 -A 40 \"Vendor ID: 0x" + vendorId + "\" | grep -B 10 -A 30 \"Product ID: 0x" + productId + "\"";
      const { stdout: deviceInfo } = await execPromise(deviceInfoCommand);
      
      console.log("Device info for ejection:", deviceInfo);
      
      // Check if it has a BSD name (storage device)
      if (deviceInfo.includes("BSD Name:")) {
        const bsdMatch = deviceInfo.match(/BSD Name:\s+(\w+)/);
        if (bsdMatch && bsdMatch[1]) {
          command = "diskutil eject " + bsdMatch[1];
        } else {
          command = "diskutil eject $(system_profiler SPUSBDataType | grep -B 10 -A 40 \"Vendor ID: 0x" + vendorId + "\" | grep -B 10 -A 30 \"Product ID: 0x" + productId + "\" | grep -A 5 \"BSD Name:\" | awk '{print $3}' | head -n 1)";
        }
      } else {
        // For charging cables, try direct system_profiler search to find device info
        console.log("No BSD name found, attempting to get full USB device info");
        
        // Run full system_profiler to find complete device data
        const fullUsbInfo = await execPromise("system_profiler SPUSBDataType");
        if (fullUsbInfo && fullUsbInfo.stdout) {
          // Parse the output to find the specific device
          const deviceSections = fullUsbInfo.stdout.split('\n\n');
          const targetDevice = deviceSections.find(section => 
            section.includes(`Vendor ID: 0x${vendorId}`) && 
            section.includes(`Product ID: 0x${productId}`)
          );
          
          if (targetDevice) {
            console.log("Found target device in system_profiler output:", targetDevice);
            
            // Check if it looks like a charging device
            const isChargingDevice = !targetDevice.includes("BSD Name:") && 
                                   (targetDevice.toLowerCase().includes("apple") || 
                                    targetDevice.toLowerCase().includes("watch") ||
                                    targetDevice.toLowerCase().includes("power"));
            
            if (isChargingDevice) {
              console.log("Detected charging device, applying power management");
              command = "sudo pmset -b disablesleep 1 && sudo pmset -b autopoweroff 0";
              
              // Also try to find USB port location for targeted power management
              const locationMatch = targetDevice.match(/Location ID:\s+(0x[0-9a-f]+)/i);
              if (locationMatch && locationMatch[1]) {
                const locationId = locationMatch[1];
                console.log("Found USB port location ID:", locationId);
                
                // Create a more targeted command using location ID
                const targetedCommand = "sudo ioreg -p IOUSB -l -w 0 | grep -A 20 \"" + locationId + "\" | grep \"IOPowerManagement\" -A 5";
                
                // Execute this command in addition to the main command
                exec(targetedCommand, (error, stdout, stderr) => {
                  if (error) {
                    console.log("Error with targeted power management:", error.message);
                  } else {
                    console.log("Targeted power management result:", stdout);
                  }
                });
              }
            } else {
              // Fallback to standard command
              command = "diskutil eject $(system_profiler SPUSBDataType | grep -B 5 -A 40 \"Vendor ID: 0x" + vendorId + "\" | grep -B 5 -A 30 \"Product ID: 0x" + productId + "\" | grep -A 5 \"BSD Name:\" | awk '{print $3}' | head -n 1)";
            }
          } else {
            // Fallback command
            command = "sudo pmset -a sleep 0 && sudo pmset -a disablesleep 1";
          }
        } else {
          // Fallback command if can't get device info
          command = "sudo pmset -a sleep 0 && sudo pmset -a disablesleep 1";
        }
      }
    } catch (error) {
      // Fallback command if error getting device info
      console.error("Error in device info retrieval:", error);
      command = "diskutil eject $(system_profiler SPUSBDataType | grep -B 5 -A 40 \"Vendor ID: 0x" + vendorId + "\" | grep -B 5 -A 30 \"Product ID: 0x" + productId + "\" | grep -A 5 \"BSD Name:\" | awk '{print $3}' | head -n 1)";
    }
  } else {
    // Linux - using udisks to eject
    command = "udisksctl unmount -b /dev/$(lsblk -o NAME,VENDOR,MODEL | grep -i \"" + vendorId + ".*" + productId + "\" | awk '{print $1}' | head -n 1)";
  }

  console.log("Executing eject command:", command);
  
  // Check if we have system privileges
  const { checkSystemPrivileges } = require('../utils/system');
  const hasPrivileges = await checkSystemPrivileges();
  
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error ejecting device on ${platform}: ${error.message}`);
        resolve({ 
          success: false, 
          message: `Error ejecting device: ${error.message}`,
          requiresAdmin: !hasPrivileges
        });
      } else {
        console.log(`Successfully ejected device on ${platform}`);
        console.log("Command output:", stdout);
        resolve({ 
          success: true, 
          message: 'Device ejected successfully',
          requiresAdmin: command.includes('sudo') && !hasPrivileges
        });
      }
    });
  });
};

// New function to refresh USB devices
const refreshUSBDevices = async (platform) => {
  let command;
  
  if (platform === 'win32') {
    // Windows - using PowerShell to rescan USB devices
    command = `powershell "Restart-Service -Name 'USBSTOR' -Force"`;
  } else if (platform === 'darwin') {
    // macOS - restart IOUSBFamily service (requires admin)
    command = `sudo kextunload -b com.apple.iokit.IOUSBFamily && sudo kextload -b com.apple.iokit.IOUSBFamily`;
  } else {
    // Linux - using udevadm to trigger USB events
    command = `udevadm trigger && udevadm settle`;
  }

  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error refreshing USB devices on ${platform}: ${error.message}`);
        resolve({ success: false, message: `Error refreshing USB devices: ${error.message}` });
      } else {
        console.log(`Successfully refreshed USB devices on ${platform}`);
        resolve({ success: true, message: 'USB devices refreshed successfully' });
      }
    });
  });
};

module.exports = {
  blockUSBDevice,
  forceBlockUSBDevice,
  ejectUSBDevice,
  refreshUSBDevices
};
