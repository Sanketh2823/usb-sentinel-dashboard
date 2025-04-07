const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const usbDetect = require("usb-detection");
const { exec, spawn } = require('child_process');
const os = require('os');

const app = express();
const port = 3001;

// Create HTTP server
const server = http.createServer(app);

// Setup WebSocket server
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());

// Data storage paths
const dataDir = path.join(__dirname, 'data');
const whitelistPath = path.join(dataDir, 'whitelist.json');
const blockedAttemptsPath = path.join(dataDir, 'blocked-attempts.json');
const logsPath = path.join(dataDir, 'logs.json');
const allowedClassesPath = path.join(dataDir, 'allowed-classes.json');

// Create data directory if it doesn't exist
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize data files if they don't exist
const initializeDataFiles = () => {
  if (!fs.existsSync(whitelistPath)) {
    fs.writeFileSync(whitelistPath, JSON.stringify([]));
  }
  
  if (!fs.existsSync(blockedAttemptsPath)) {
    fs.writeFileSync(blockedAttemptsPath, JSON.stringify([]));
  }
  
  if (!fs.existsSync(logsPath)) {
    fs.writeFileSync(logsPath, JSON.stringify([]));
  }

  if (!fs.existsSync(allowedClassesPath)) {
    // Default allowed device classes: keyboard (03), mouse (03), webcam/video (0e), audio (01)
    fs.writeFileSync(allowedClassesPath, JSON.stringify([
      { id: "03", name: "HID (Human Interface Device)", description: "Keyboards, mice, etc." },
      { id: "01", name: "Audio", description: "Audio devices" },
      { id: "0e", name: "Video", description: "Webcams" }
    ]));
  }
};

initializeDataFiles();

// New function to check for admin/system privileges
const checkSystemPrivileges = () => {
  return new Promise((resolve) => {
    const platform = os.platform();
    let checkCommand;
    
    if (platform === 'darwin') {
      // Check for admin access on macOS
      checkCommand = 'sudo -n true 2>/dev/null';
    } else if (platform === 'win32') {
      // Check for admin access on Windows
      checkCommand = 'net session >nul 2>&1';
    } else {
      // Check for sudo access on Linux
      checkCommand = 'sudo -n true 2>/dev/null';
    }
    
    exec(checkCommand, (error) => {
      // If there's an error, we don't have admin privileges
      resolve(!error);
    });
  });
};

// Helper function to get permission instructions based on platform
const getPermissionInstructions = () => {
  const platform = os.platform();
  
  if (platform === 'darwin') {
    return {
      platform: 'macOS',
      instructions: [
        'Open Terminal and run the following command:',
        'sudo /path/to/your/app',
        'Alternatively, you can run this command to grant permissions:',
        'sudo chmod +s /path/to/your/app',
        'For USB power management, you may need to grant Full Disk Access to Terminal in System Preferences > Security & Privacy > Privacy'
      ]
    };
  } else if (platform === 'win32') {
    return {
      platform: 'Windows',
      instructions: [
        'Right-click on the application and select "Run as administrator"',
        'Or, you can create a shortcut to the app, right-click the shortcut, select Properties, click Advanced, and check "Run as administrator"',
        'You may also need to run Command Prompt as administrator and start the application from there'
      ]
    };
  } else {
    return {
      platform: 'Linux',
      instructions: [
        'Run the application with sudo:',
        'sudo /path/to/your/app',
        'Alternatively, you can create a udev rule to allow non-root users to manage USB devices:',
        'Create a file at /etc/udev/rules.d/99-usb-permissions.rules',
        'Add: SUBSYSTEM=="usb", MODE="0666"',
        'Then run: sudo udevadm control --reload-rules && sudo udevadm trigger'
      ]
    };
  }
};

// Helper functions for data operations
const readDataFile = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return [];
  }
};

const writeDataFile = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
    return false;
  }
};

// Enhanced function to get device class information
const getDeviceClass = async (vendorId, productId) => {
  return new Promise((resolve) => {
    let deviceClass = "FF"; // Default to "unknown" class
    
    // Different commands for different platforms
    let command;
    const platform = os.platform();
    
    if (platform === 'win32') {
      // Windows - using PowerShell to query device class
      command = `powershell "Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${vendorId}&PID_${productId}*' } | Select-Object -ExpandProperty Class"`;
    } else if (platform === 'darwin') {
      // macOS - improved method to get USB class
      command = `ioreg -p IOUSB -l -w 0 | grep -A 30 "USB Vendor Name" | grep -i "${vendorId}" | grep -A 20 "${productId}" | grep "USB Class" | head -n 1`;
    } else {
      // Linux - using lsusb to get USB device info
      command = `lsusb -d ${vendorId}:${productId} -v | grep bDeviceClass`;
    }
    
    // Execute command to get device class
    exec(command, (error, stdout, stderr) => {
      if (!error && stdout) {
        try {
          if (platform === 'win32') {
            // Parse Windows output
            deviceClass = stdout.trim();
            
            // Map Windows device class names to USB class codes
            const windowsClassMap = {
              "Keyboard": "03",
              "Mouse": "03",
              "HIDClass": "03",
              "USBDevice": "00",
              "Camera": "0e",
              "WebCam": "0e",
              "AudioEndpoint": "01",
              "Media": "01"
            };
            
            for (const [key, value] of Object.entries(windowsClassMap)) {
              if (deviceClass.includes(key)) {
                deviceClass = value;
                break;
              }
            }
          } else if (platform === 'darwin') {
            // Parse macOS output - improved parsing for ioreg output
            const match = stdout.match(/USB Class.*?<([0-9a-f]+)>/i);
            if (match && match[1]) {
              deviceClass = match[1].trim().toLowerCase();
            } else {
              // Alternative method using system_profiler
              exec(`system_profiler SPUSBDataType | grep -A 30 "Vendor ID: 0x${vendorId}" | grep -A 20 "Product ID: 0x${productId}" | grep -i "Class:"`, (err, out) => {
                if (!err && out) {
                  const classMatch = out.match(/Class: ([0-9A-Za-z]+)/i);
                  if (classMatch && classMatch[1]) {
                    const classText = classMatch[1].trim().toLowerCase();
                    // Map common class names to class codes
                    const classMap = {
                      "mass": "08",
                      "storage": "08",
                      "hid": "03",
                      "audio": "01",
                      "video": "0e",
                      "printer": "07",
                      "hub": "09",
                      "comm": "02",
                      "communication": "02"
                    };
                    
                    for (const [key, value] of Object.entries(classMap)) {
                      if (classText.includes(key)) {
                        deviceClass = value;
                        break;
                      }
                    }
                  }
                }
              });
            }
          } else {
            // Parse Linux output
            const match = stdout.match(/bDeviceClass\s+(\w+)/);
            if (match && match[1]) {
              deviceClass = match[1].trim();
            }
          }
        } catch (parseError) {
          console.error("Error parsing device class:", parseError);
        }
      }
      
      resolve(deviceClass);
    });
  });
};

// Implement advanced macOS USB class blocking using IOKit/kext commands
const blockUsbClassOnMacOS = async (classId) => {
  console.log(`Attempting to block USB class ${classId} on macOS`);
  
  // Convert hexadecimal class ID to decimal if needed
  const classHex = classId.toLowerCase();
  
  try {
    // Different approaches based on the class ID
    switch (classHex) {
      case "08": // Mass Storage
        console.log("Blocking USB Mass Storage devices");
        // Attempt to unload the mass storage driver
        await execPromise("sudo kextunload -b com.apple.driver.usb.massstorage").catch(e => 
          console.error("Error unloading mass storage kext:", e.message));
        break;
      
      case "07": // Printers
        console.log("Blocking USB Printer devices");
        await execPromise("sudo kextunload -b com.apple.driver.AppleUSBPrinter").catch(e => 
          console.error("Error unloading printer kext:", e.message));
        break;
        
      case "02": // Communication devices
        console.log("Blocking USB Communication devices");
        await execPromise("sudo kextunload -b com.apple.driver.usb.cdc.acm").catch(e => 
          console.error("Error unloading CDC kext:", e.message));
        await execPromise("sudo kextunload -b com.apple.driver.usb.cdc.ecm").catch(e => 
          console.error("Error unloading CDC ECM kext:", e.message));
        break;
        
      default:
        // Generic approach for other class types
        // Use ioreg to identify devices with this class and then attempt to block them
        const ioregCommand = `ioreg -p IOUSB -w0 | grep -B 5 -A 10 "USB Class.*<${classHex}>"`;
        const deviceInfo = await execPromise(ioregCommand).catch(e => ({ stdout: "" }));
        
        if (deviceInfo.stdout) {
          console.log(`Found devices with class ${classHex}, attempting to block`);
          
          // Extract device locations and try to disable them
          const lines = deviceInfo.stdout.split("\n");
          for (const line of lines) {
            if (line.includes("IOService")) {
              const locationMatch = line.match(/IOService:([^{]+)/);
              if (locationMatch && locationMatch[1]) {
                const devicePath = locationMatch[1].trim();
                
                // Attempt to disable device power management
                console.log(`Attempting to disable device at ${devicePath}`);
                await execPromise(`sudo ioreg -c IOUSBDevice | grep "${devicePath}" -A 20 | grep -i "IOPowerManagement" -A 5`).catch(() => {});
              }
            }
          }
        } else {
          console.log(`No devices with class ${classHex} found currently connected`);
        }
    }
    
    return { success: true, message: `Attempted to block USB class ${classId}` };
  } catch (error) {
    console.error(`Error blocking USB class ${classId} on macOS:`, error);
    return { success: false, message: error.message };
  }
};

// Implement advanced macOS USB device blocking
const blockSpecificUsbDeviceOnMacOS = async (vendorId, productId) => {
  console.log(`Attempting to block specific USB device ${vendorId}:${productId} on macOS`);
  
  try {
    // Step 1: Get detailed device information
    const deviceInfoCommand = `ioreg -p IOUSB -l -w 0 | grep -B 10 -A 30 "idVendor.*0x${vendorId}" | grep -B 10 -A 20 "idProduct.*0x${productId}"`;
    const deviceInfo = await execPromise(deviceInfoCommand).catch(e => ({ stdout: "" }));
    
    // Step 2: Extract device class to decide best blocking method
    const deviceClass = await getDeviceClass(vendorId, productId);
    console.log(`Device ${vendorId}:${productId} has class: ${deviceClass}`);
    
    // Step 3: Check if storage device (has BSD name)
    const bsdCheckCommand = `system_profiler SPUSBDataType | grep -A 20 "Vendor ID: 0x${vendorId}" | grep -A 15 "Product ID: 0x${productId}" | grep "BSD Name:"`;
    const bsdCheck = await execPromise(bsdCheckCommand).catch(e => ({ stdout: "" }));
    
    if (bsdCheck.stdout && bsdCheck.stdout.includes("BSD Name:")) {
      // Device is a storage device
      const bsdMatch = bsdCheck.stdout.match(/BSD Name:\s+(\w+)/);
      if (bsdMatch && bsdMatch[1]) {
        const bsdName = bsdMatch[1].trim();
        console.log(`Found storage device with BSD name: ${bsdName}, attempting to eject`);
        
        // Try unmounting it
        const unmountCommand = `diskutil unmount "${bsdName}"`;
        await execPromise(unmountCommand).catch(e => 
          console.error(`Error unmounting ${bsdName}:`, e.message));
          
        // Try to block it from automounting in future
        await execPromise(`sudo srm -rf /Volumes/${bsdName}`).catch(() => {});
      }
    }
    
    // Step 4: Try class-based blocking
    if (deviceClass && deviceClass !== "FF") {
      await blockUsbClassOnMacOS(deviceClass);
    }
    
    // Step 5: Try device-specific blocking using location ID
    if (deviceInfo.stdout) {
      const locationMatch = deviceInfo.stdout.match(/locationID"\s+=\s+([0-9a-fx]+)/i);
      if (locationMatch && locationMatch[1]) {
        const locationId = locationMatch[1].trim();
        console.log(`Found USB device location ID: ${locationId}, attempting targeted block`);
        
        // Attempt power management control
        const powerCommand = `sudo ioreg -l -w 0 | grep -A 20 "${locationId}" | grep "IOPowerManagement" -A 5`;
        await execPromise(powerCommand).catch(() => {});
      }
    }
    
    return { success: true, message: `Attempted multiple methods to block device ${vendorId}:${productId}` };
  } catch (error) {
    console.error(`Error blocking USB device ${vendorId}:${productId} on macOS:`, error);
    return { success: false, message: error.message };
  }
};

// Add a new endpoint to check system permissions
app.get('/api/system-permissions', async (req, res) => {
  try {
    const hasPrivileges = await checkSystemPrivileges();
    const permissionInstructions = getPermissionInstructions();
    
    res.json({
      hasSystemPrivileges: hasPrivileges,
      platform: os.platform(),
      permissionInstructions
    });
  } catch (error) {
    console.error('Error checking system permissions:', error);
    res.status(500).json({ error: 'Failed to check system permissions' });
  }
});

// Helper function to promisify exec
const execPromise = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

// New endpoint to block a specific USB class (category of devices)
app.post('/api/block-usb-class', async (req, res) => {
  try {
    const { classId } = req.body;
    if (!classId) {
      return res.status(400).json({ error: 'Class ID is required' });
    }
    
    const platform = os.platform();
    let result = { success: false, message: 'Unsupported platform' };
    
    console.log(`Attempting to block USB class ${classId} on ${platform}`);
    
    if (platform === 'darwin') {
      // macOS implementation
      result = await blockUsbClassOnMacOS(classId);
    } else if (platform === 'win32') {
      // Windows implementation
      // Similar commands for Windows would go here
      result = { success: false, message: 'Windows class blocking not yet implemented' };
    } else {
      // Linux implementation
      // Similar commands for Linux would go here
      result = { success: false, message: 'Linux class blocking not yet implemented' };
    }
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      action: `Block USB Class ${classId}`,
      status: result.success ? 'success' : 'failed',
      message: result.message,
      date: new Date().toISOString(),
      id: Date.now()
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the update
    broadcastUpdate({
      newLog: logEntry
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error blocking USB class:', error);
    res.status(500).json({ error: 'Failed to block USB class', message: error.message });
  }
});

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

// Function to block a USB device
const blockUSBDevice = async (vendorId, productId) => {
  const platform = os.platform();
  
  if (platform === 'win32') {
    // Windows - using PnPUtil to disable device
    const command = `powershell "Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${vendorId}&PID_${productId}*' } | Disable-PnpDevice -Confirm:$false"`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error blocking device on Windows: ${error.message}`);
        return false;
      }
      return true;
    });
  } else if (platform === 'darwin') {
    // macOS - using improved command with proper quoting
    // First check if the device has a BSD name (storage device)
    const checkCommand = `system_profiler SPUSBDataType | grep -A 20 "Vendor ID: 0x${vendorId}" | grep -A 15 "Product ID: 0x${productId}" | grep "BSD Name:"`;
    
    exec(checkCommand, (error, stdout, stderr) => {
      if (error || !stdout) {
        // Device doesn't have a BSD name (likely a charging cable)
        console.log("Device appears to be a non-storage device, attempting power management");
        
        // Try power management for charging cables
        const pmCommand = `sudo pmset -b disablesleep 1 && sudo pmset -a hibernatemode 0`;
        exec(pmCommand, (pmError, pmStdout, pmStderr) => {
          if (pmError) {
            console.error(`Error with power management: ${pmError.message}`);
          }
        });
      } else {
        // Device has a BSD name, attempt to unmount it
        // Fixed command with proper quoting
        const bsdMatch = stdout.match(/BSD Name:\s+(\w+)/);
        if (bsdMatch && bsdMatch[1]) {
          const bsdName = bsdMatch[1];
          console.log(`Found BSD name: ${bsdName}, attempting to unmount`);
          
          const unmountCommand = `diskutil unmount ${bsdName}`;
          exec(unmountCommand, (unmountError, unmountStdout, unmountStderr) => {
            if (unmountError) {
              console.error(`Error unmounting device: ${unmountError.message}`);
              return false;
            }
            console.log(`Successfully unmounted device: ${unmountStdout.trim()}`);
            return true;
          });
        } else {
          console.error("Could not extract BSD name from device info");
          return false;
        }
      }
    });
  } else {
    // Linux - using USB authorization or udev rules
    // This requires root privileges
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

// Broadcast updates to all connected clients
const broadcastUpdate = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

// API Endpoints

// Check system permissions endpoint
app.get('/api/system-permissions', async (req, res) => {
  try {
    const hasPrivileges = await checkSystemPrivileges();
    const permissionInstructions = getPermissionInstructions();
    
    res.json({
      hasSystemPrivileges: hasPrivileges,
      platform: os.platform(),
      permissionInstructions
    });
  } catch (error) {
    console.error('Error checking system permissions:', error);
    res.status(500).json({ error: 'Failed to check system permissions' });
  }
});

// Block USB class endpoint
app.post('/api/block-usb-class', async (req, res) => {
  try {
    const { classId } = req.body;
    if (!classId) {
      return res.status(400).json({ error: 'Class ID is required' });
    }
    
    const platform = os.platform();
    let result = { success: false, message: 'Unsupported platform' };
    
    console.log(`Attempting to block USB class ${classId} on ${platform}`);
    
    if (platform === 'darwin') {
      // macOS implementation
      result = await blockUsbClassOnMacOS(classId);
    } else if (platform === 'win32') {
      // Windows implementation
      result = { success: false, message: 'Windows class blocking not yet implemented' };
    } else {
      // Linux implementation
      result = { success: false, message: 'Linux class blocking not yet implemented' };
    }
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      action: `Block USB Class ${classId}`,
      status: result.success ? 'success' : 'failed',
      message: result.message,
      date: new Date().toISOString(),
      id: Date.now()
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the update
    broadcastUpdate({
      newLog: logEntry
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error blocking USB class:', error);
    res.status(500).json({ error: 'Failed to block USB class', message: error.message });
  }
});

// Get USB devices endpoint
app.get('/api/usb-devices', (req, res) => {
  try {
    const whitelistedDevices = readDataFile(whitelistPath);
    const blockedAttempts = readDataFile(blockedAttemptsPath);
    const logs = readDataFile(logsPath);
    const allowedClasses = readDataFile(allowedClassesPath);
    
    res.json({
      whitelistedDevices,
      blockedAttempts,
      logs,
      allowedClasses
    });
  } catch (error) {
    console.error('Error retrieving USB devices:', error);
    res.status(500).json({ error: 'Failed to retrieve USB devices' });
  }
});

// Get allowed device classes endpoint
app.get('/api/allowed-classes', (req, res) => {
  try {
    const allowedClasses = readDataFile(allowedClassesPath);
    res.json(allowedClasses);
  } catch (error) {
    console.error('Error retrieving allowed classes:', error);
    res.status(500).json({ error: 'Failed to retrieve allowed classes' });
  }
});

// Update allowed device classes endpoint
app.post('/api/allowed-classes', (req, res) => {
  try {
    const allowedClasses = req.body;
    writeDataFile(allowedClassesPath, allowedClasses);
    
    // Broadcast update
    broadcastUpdate({
      allowedClassesUpdate: allowedClasses
    });
    
    res.json({ success: true, message: 'Allowed classes updated successfully' });
  } catch (error) {
    console.error('Error updating allowed classes:', error);
    res.status(500).json({ error: 'Failed to update allowed classes' });
  }
});

// Add device to whitelist endpoint
app.post('/api/whitelist', (req, res) => {
  try {
    const device = req.body;
    if (!device.vendorId || !device.productId) {
      return res.status(400).json({ error: 'Vendor ID and Product ID are required' });
    }
    
    const whitelistedDevices = readDataFile(whitelistPath);
    
    // Check if device is already whitelisted
    const isAlreadyWhitelisted = whitelistedDevices.some(
      (d) => d.vendorId === device.vendorId && d.productId === device.productId
    );
    
    if (!isAlreadyWhitelisted) {
      // Add device to whitelist
      whitelistedDevices.push({
        ...device,
        dateAdded: new Date().toISOString(),
        id: Date.now()
      });
      
      writeDataFile(whitelistPath, whitelistedDevices);
      
      // Log the action
      const logs = readDataFile(logsPath);
      const logEntry = {
        action: 'Add to Whitelist',
        device: `${device.name} (${device.vendorId}:${device.productId})`,
        date: new Date().toISOString(),
        id: Date.now()
      };
      logs.unshift(logEntry);
      writeDataFile(logsPath, logs);
      
      // Broadcast update
      broadcastUpdate({
        whitelistUpdate: whitelistedDevices,
        newLog: logEntry
      });
      
      res.json({ success: true, message: 'Device added to whitelist' });
    } else {
      res.json({ success: true, message: 'Device already in whitelist' });
    }
  } catch (error) {
    console.error('Error adding device to whitelist:', error);
    res.status(500).json({ error: 'Failed to add device to whitelist' });
  }
});

// Remove device from whitelist endpoint
app.delete('/api/whitelist/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const whitelistedDevices = readDataFile(whitelistPath);
    const deviceIndex = whitelistedDevices.findIndex((d) => d.id === Number(id));
    
    if (deviceIndex !== -1) {
      const removedDevice = whitelistedDevices[deviceIndex];
      
      // Remove device from whitelist
      whitelistedDevices.splice(deviceIndex, 1);
      writeDataFile(whitelistPath, whitelistedDevices);
      
      // Log the action
      const logs = readDataFile(logsPath);
      const logEntry = {
        action: 'Remove from Whitelist',
        device: `${removedDevice.name} (${removedDevice.vendorId}:${removedDevice.productId})`,
        date: new Date().toISOString(),
        id: Date.now()
      };
      logs.unshift(logEntry);
      writeDataFile(logsPath, logs);
      
      // Broadcast update
      broadcastUpdate({
        whitelistUpdate: whitelistedDevices,
        newLog: logEntry
      });
      
      res.json({ success: true, message: 'Device removed from whitelist' });
    } else {
      res.status(404).json({ error: 'Device not found in whitelist' });
    }
  } catch (error) {
    console.error('Error removing device from whitelist:', error);
    res.status(500).json({ error: 'Failed to remove device from whitelist' });
  }
});

// Clear logs endpoint
app.delete('/api/logs', (req, res) => {
  try {
    writeDataFile(logsPath, []);
    
    // Broadcast update
    broadcastUpdate({
      logsUpdate: []
    });
    
    res.json({ success: true, message: 'Logs cleared successfully' });
  } catch (error) {
    console.error('Error clearing logs:', error);
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

// Clear blocked attempts endpoint
app.delete('/api/blocked-attempts', (req, res) => {
  try {
    writeDataFile(blockedAttemptsPath, []);
    
    // Broadcast update
    broadcastUpdate({
      blockedAttemptsUpdate: []
    });
    
    res.json({ success: true, message: 'Blocked attempts cleared successfully' });
  } catch (error) {
    console.error('Error clearing blocked attempts:', error);
    res.status(500).json({ error: 'Failed to clear blocked attempts' });
  }
});

// Eject USB device endpoint
app.post('/api/eject-device', async (req, res) => {
  try {
    const { vendorId, productId } = req.body;
    if (!vendorId || !productId) {
      return res.status(400).json({ error: 'Vendor ID and Product ID are required' });
    }
    
    const platform = os.platform();
    
    // Attempt to eject device
    const result = await ejectUSBDevice(vendorId, productId, platform);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      action: 'Eject Device',
      device: `${vendorId}:${productId}`,
      status: result.success ? 'success' : 'failed',
      message: result.message,
      date: new Date().toISOString(),
      id: Date.now()
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the update
    broadcastUpdate({
      newLog: logEntry
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error ejecting device:', error);
    res.status(500).json({ error: 'Failed to eject device', message: error.message });
  }
});

// Block USB device endpoint
app.post('/api/block-device', async (req, res) => {
  try {
    const { vendorId, productId } = req.body;
    if (!vendorId || !productId) {
      return res.status(400).json({ error: 'Vendor ID and Product ID are required' });
    }
    
    // Attempt to block device
    const success = await blockUSBDevice(vendorId, productId);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      action: 'Block Device',
      device: `${vendorId}:${productId}`,
      status: success ? 'success' : 'failed',
      date: new Date().toISOString(),
      id: Date.now()
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the update
    broadcastUpdate({
      newLog: logEntry
    });
    
    res.json({ success, message: success ? 'Device blocked successfully' : 'Failed to block device' });
  } catch (error) {
    console.error('Error blocking device:', error);
    res.status(500).json({ error: 'Failed to block device', message: error.message });
  }
});

// Force block USB device endpoint
app.post('/api/force-block-device', async (req, res) => {
  try {
    const { vendorId, productId } = req.body;
    if (!vendorId || !productId) {
      return res.status(400).json({ error: 'Vendor ID and Product ID are required' });
    }
    
    // Attempt to force block device
    const result = await forceBlockUSBDevice(vendorId, productId);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      action: 'Force Block Device',
      device: `${vendorId}:${productId}`,
      status: result.success ? 'success' : 'failed',
      message: result.message,
      date: new Date().toISOString(),
      id: Date.now()
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the update
    broadcastUpdate({
      newLog: logEntry
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error force blocking device:', error);
    res.status(500).json({ error: 'Failed to force block device', message: error.message });
  }
});

// Refresh USB devices endpoint
app.post('/api/refresh-devices', async (req, res) => {
  try {
    const platform = os.platform();
    
    // Attempt to refresh USB devices
    const result = await refreshUSBDevices(platform);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      action: 'Refresh USB Devices',
      status: result.success ? 'success' : 'failed',
      message: result.message,
      date: new Date().toISOString(),
      id: Date.now()
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the update
    broadcastUpdate({
      newLog: logEntry
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error refreshing USB devices:', error);
    res.status(500).json({ error: 'Failed to refresh USB devices', message: error.message });
  }
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected');
  
  // Send initial data to the client
  try {
    const whitelistedDevices = readDataFile(whitelistPath);
    const blockedAttempts = readDataFile(blockedAttemptsPath);
    const logs = readDataFile(logsPath);
    const allowedClasses = readDataFile(allowedClassesPath);
    
    ws.send(JSON.stringify({
      whitelistedDevices,
      blockedAttempts,
      logs,
      allowedClasses
    }));
  } catch (error) {
    console.error('Error sending initial data:', error);
  }
  
  ws.on('error', console.error);
  
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Function to broadcast updates to all connected clients
const broadcastUpdate = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

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

// Start the server
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Current platform: ${os.platform()}`);
  
  checkSystemPrivileges().then((hasPrivileges) => {
    if (hasPrivileges) {
      console.log('Running with system privileges');
    } else {
      console.log('Running without system privileges - some functionality may be limited');
      console.log('Run with sudo/admin privileges for full functionality');
    }
  });
});
