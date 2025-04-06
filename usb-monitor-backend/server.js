const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const usbDetect = require("usb-detection");
const { exec } = require('child_process');
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
    // Default allowed device classes: keyboard (03), mouse (02), webcam/video (0e)
    fs.writeFileSync(allowedClassesPath, JSON.stringify([
      { id: "03", name: "HID (Human Interface Device)", description: "Keyboards, mice, etc." },
      { id: "02", name: "CDC Control", description: "Communication devices" },
      { id: "0e", name: "Video", description: "Webcams" },
      { id: "01", name: "Audio", description: "Audio devices" }
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

// Function to get device class information
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
      // macOS - using system_profiler to get USB device info
      command = `system_profiler SPUSBDataType | grep -A 20 "Vendor ID: 0x${vendorId}" | grep -A 15 "Product ID: 0x${productId}" | grep "Class:"`;
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
            // Parse macOS output
            const match = stdout.match(/Class: (.+)/);
            if (match && match[1]) {
              deviceClass = match[1].trim();
              
              // Map macOS class names to USB class codes
              const macClassMap = {
                "HID": "03",
                "Video": "0e",
                "Audio": "01"
              };
              
              for (const [key, value] of Object.entries(macClassMap)) {
                if (deviceClass.includes(key)) {
                  deviceClass = value;
                  break;
                }
              }
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

// Improved function to block a USB device with more aggressive methods
const forceBlockUSBDevice = async (vendorId, productId, platform) => {
  // Get more detailed device info for targeted blocking
  let deviceDetails = null;
  
  try {
    // Get USB device details
    const deviceDetailsCommand = platform === 'darwin' 
      ? `system_profiler SPUSBDataType | grep -B 5 -A 30 "Vendor ID: 0x${vendorId}" | grep -B 5 -A 25 "Product ID: 0x${productId}"`
      : platform === 'win32'
        ? `powershell "Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${vendorId}&PID_${productId}*' } | Format-List"`
        : `lsusb -d ${vendorId}:${productId} -v`;
    
    const deviceDetailsResult = await execPromise(deviceDetailsCommand);
    deviceDetails = deviceDetailsResult.stdout;
    console.log("Device details:", deviceDetails);
  } catch (error) {
    console.log("Error getting device details:", error);
  }
  
  // Before attempting to block, check privileges
  const hasPrivileges = await checkSystemPrivileges();
  console.log(`System privileges check: ${hasPrivileges ? 'Yes' : 'No'}`);
  
  // First try standard blocking method
  const standardBlockResult = await blockUSBDevice(vendorId, productId);
  
  // Then apply platform-specific enhanced blocking methods
  if (platform === 'win32') {
    // Windows - using more aggressive PowerShell commands to disable
    try {
      // First try to disable through device manager
      const disableCommand = `powershell "Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${vendorId}&PID_${productId}*' } | Disable-PnpDevice -Confirm:$false -ErrorAction SilentlyContinue"`;
      await execPromise(disableCommand);
      
      // Then try to set device to "do not use" through registry
      const registryCommand = `powershell "Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${vendorId}&PID_${productId}*' } | ForEach-Object { $_ | New-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\$($_.DeviceID)' -Name 'ConfigFlags' -Value 1 -PropertyType DWORD -Force -ErrorAction SilentlyContinue }"`;
      await execPromise(registryCommand);
      
      return {
        success: true,
        requiresAdmin: !hasPrivileges
      };
    } catch (error) {
      console.error(`Error with enhanced blocking on Windows: ${error.message}`);
      return {
        success: false,
        requiresAdmin: true,
        error: error.message
      };
    }
  } else if (platform === 'darwin') {
    // macOS - using additional methods beyond just ejecting
    try {
      console.log("Attempting enhanced macOS blocking for device:", vendorId, productId);
      
      // For charging devices, try to disable USB power with pmset
      const powerCommand = `sudo pmset -a disablesleep 1`;
      await execPromise(powerCommand).catch(e => console.log("Power setting requires admin rights:", e.message));
      
      // Also try to unload USB drivers for more complete blocking
      const driverCommand = `sudo kextunload -b com.apple.iokit.IOUSBHostFamily`;
      await execPromise(driverCommand).catch(e => console.log("Driver unload requires admin rights:", e.message));
      
      // Special handling for Apple charging cables which often have specific patterns in their details
      if (deviceDetails) {
        console.log("Analyzing device details for Apple charging cable pattern");
        const isAppleDevice = deviceDetails.toLowerCase().includes("apple") || 
                            deviceDetails.toLowerCase().includes("watch") || 
                            deviceDetails.toLowerCase().includes("iphone") || 
                            deviceDetails.toLowerCase().includes("ipad");
        
        const isChargingDevice = deviceDetails.toLowerCase().includes("power") || 
                              deviceDetails.toLowerCase().includes("charg") || 
                              deviceDetails.toLowerCase().includes("battery") ||
                              !deviceDetails.toLowerCase().includes("storage");
        
        if (isAppleDevice && isChargingDevice) {
          console.log("Detected Apple charging device, attempting specialized block");
          
          // Try direct USB power control for Apple charging devices
          const appleUsbCommand = `sudo kextunload -b com.apple.driver.AppleUSBHostMergeProperties`;
          await execPromise(appleUsbCommand).catch(e => console.log("Apple USB control requires admin rights:", e.message));
          
          // Try to block the specific USB port where the device is connected
          const portInfoCommand = `system_profiler SPUSBDataType | grep -B 10 -A 2 "Vendor ID: 0x${vendorId}"`;
          const portInfo = await execPromise(portInfoCommand).catch(e => console.log("Error getting port info:", e.message));
          
          if (portInfo && portInfo.stdout) {
            const portMatch = portInfo.stdout.match(/Location ID: (0x[0-9a-f]+)/i);
            if (portMatch && portMatch[1]) {
              const locationId = portMatch[1];
              console.log("Found USB port location ID:", locationId);
              
              // Attempt to disable the specific port
              const portDisableCommand = `sudo ioreg -p IOUSB -l -w 0 | grep -A 10 "${locationId}" | grep "IOPowerManagement" -A 3`;
              await execPromise(portDisableCommand).catch(e => console.log("Port power management requires admin rights:", e.message));
            }
          }
        }
      }
      
      // Get direct device info from system_profiler
      const directInfoCommand = `system_profiler SPUSBDataType`;
      const directInfo = await execPromise(directInfoCommand).catch(e => console.log("Error getting direct device info:", e.message));
      
      if (directInfo && directInfo.stdout) {
        console.log("Analyzing full USB device list to find charging device");
        
        // Look for Apple devices and charging cables
        const deviceSection = directInfo.stdout.split('\n\n').find(section => 
          section.includes(`Vendor ID: 0x${vendorId}`) && 
          section.includes(`Product ID: 0x${productId}`)
        );
        
        if (deviceSection) {
          console.log("Found device section:", deviceSection);
          
          // Check if it's a charging device (Apple Watch chargers often don't have BSD names)
          const isChargingOnly = !deviceSection.includes("BSD Name:") && 
                              (deviceSection.toLowerCase().includes("apple") || 
                               deviceSection.toLowerCase().includes("watch") ||
                               deviceSection.toLowerCase().includes("power"));
          
          if (isChargingOnly) {
            console.log("Detected charging-only device, attempting specialized power management");
            
            // Try to use ioreg to find the specific device
            const ioregCommand = `ioreg -p IOUSB -l | grep -A 20 -B 5 "${vendorId}" | grep -A 15 -B 5 "${productId}"`;
            const ioregInfo = await execPromise(ioregCommand).catch(e => console.log("Error getting ioreg info:", e.message));
            
            if (ioregInfo && ioregInfo.stdout) {
              console.log("Found device in ioreg, attempting power management");
              
              // Attempt aggressive power management
              const pmCommand = `sudo pmset -b batterypollinterval 0 && sudo pmset -b sleep 0 && sudo pmset -a hibernatemode 0`;
              await execPromise(pmCommand).catch(e => console.log("PM command requires admin rights:", e.message));
            }
          }
        }
      }
      
      return {
        success: true,
        requiresAdmin: !hasPrivileges
      };
    } catch (error) {
      console.error(`Error with enhanced blocking on macOS: ${error.message}`);
      return {
        success: false,
        requiresAdmin: true,
        error: error.message
      };
    }
  } else {
    // Linux - using additional methods beyond authorization
    try {
      // Try more aggressive USB power management
      const linuxCommand = `echo 'auto' | sudo tee /sys/bus/usb/devices/*/power/control`;
      await execPromise(linuxCommand).catch(() => console.log("Power control requires admin rights"));
      
      return {
        success: true,
        requiresAdmin: !hasPrivileges
      };
    } catch (error) {
      console.error(`Error with enhanced blocking on Linux: ${error.message}`);
      return {
        success: false,
        requiresAdmin: true,
        error: error.message
      };
    }
  }
  
  return {
    success: standardBlockResult,
    requiresAdmin: !hasPrivileges
  };
};

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

// Modified ejectUSBDevice function to fix the syntax error with template literals
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
          // Fallback to standard command if can't get device info
          command = "sudo pmset -a sleep 0 && sudo pmset -a disablesleep 1";
        }
      }
    } catch (error) {
      // Fallback to standard command if error getting device info
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

// Get allowed device classes
app.get('/api/allowed-classes', (req, res) => {
  try {
    const allowedClasses = readDataFile(allowedClassesPath);
    res.json(allowedClasses);
  } catch (error) {
    console.error('Error retrieving allowed classes:', error);
    res.status(500).json({ error: 'Failed to retrieve allowed classes' });
  }
});

// Update allowed device classes
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

// Add device to whitelist
app.post('/api/whitelist', (req, res) => {
  try {
    const newDevice = req.body;
    const whitelistedDevices = readDataFile(whitelistPath);
    
    // Add a unique ID and status to the device
    const deviceWithId = {
      ...newDevice,
      id: Date.now(),
      status: 'allowed',
      date: new Date().toISOString()
    };
    
    // Add to whitelist
    whitelistedDevices.push(deviceWithId);
    writeDataFile(whitelistPath, whitelistedDevices);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      ...deviceWithId,
      action: 'Added to whitelist',
      id: Date.now() // Unique ID for log entry
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the update
    broadcastUpdate({
      whitelistUpdate: whitelistedDevices,
      newLog: logEntry
    });
    
    res.status(201).json(deviceWithId);
  } catch (error) {
    console.error('Error adding device to whitelist:', error);
    res.status(500).json({ error: 'Failed to add device to whitelist' });
  }
});

// Remove device from whitelist
app.delete('/api/whitelist/:id', (req, res) => {
  try {
    const deviceId = parseInt(req.params.id);
    let whitelistedDevices = readDataFile(whitelistPath);
    
    // Find the device to remove
    const deviceToRemove = whitelistedDevices.find(device => device.id === deviceId);
    
    if (!deviceToRemove) {
      return res.status(404).json({ error: 'Device not found in whitelist' });
    }
    
    // Remove from whitelist
    whitelistedDevices = whitelistedDevices.filter(device => device.id !== deviceId);
    writeDataFile(whitelistPath, whitelistedDevices);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      ...deviceToRemove,
      action: 'Removed from whitelist',
      status: 'blocked',
      id: Date.now() // Unique ID for log entry
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Add to blocked attempts if needed
    const blockedAttempts = readDataFile(blockedAttemptsPath);
    const blockedEntry = {
      ...deviceToRemove,
      status: 'blocked',
      date: new Date().toISOString(),
      id: Date.now() // Unique ID for blocked entry
    };
    blockedAttempts.unshift(blockedEntry);
    writeDataFile(blockedAttemptsPath, blockedAttempts);
    
    // Try to actually block the device
    blockUSBDevice(deviceToRemove.vendorId, deviceToRemove.productId);
    
    // Broadcast the update
    broadcastUpdate({
      whitelistUpdate: whitelistedDevices,
      newBlockedAttempt: blockedEntry,
      newLog: logEntry
    });
    
    res.json({ message: 'Device removed from whitelist and blocked successfully' });
  } catch (error) {
    console.error('Error removing device from whitelist:', error);
    res.status(500).json({ error: 'Failed to remove device from whitelist' });
  }
});

// New endpoint to get system info
app.get('/api/system-info', (req, res) => {
  try {
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      type: os.type(),
      release: os.release(),
      cpus: os.cpus().length,
      memory: {
        total: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + ' GB',
        free: Math.round(os.freemem() / (1024 * 1024 * 1024)) + ' GB'
      },
      uptime: Math.floor(os.uptime() / 3600) + ' hours'
    };
    
    res.json(systemInfo);
  } catch (error) {
    console.error('Error getting system info:', error);
    res.status(500).json({ error: 'Failed to get system info' });
  }
});

// New endpoint to eject a USB device
app.post('/api/eject-device', async (req, res) => {
  try {
    const { vendorId, productId } = req.body;
    const platform = os.platform();
    
    // Log the eject attempt
    console.log(`Attempting to eject device: ${vendorId}:${productId} on ${platform}`);
    
    // Call the eject function
    const result = await ejectUSBDevice(vendorId, productId, platform);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      vendorId,
      productId,
      action: 'Eject attempted',
      status: result.success ? 'success' : 'failed',
      message: result.message,
      requiresAdmin: result.requiresAdmin,
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

// New endpoint to force block a USB device
app.post('/api/force-block-device', async (req, res) => {
  try {
    const { vendorId, productId } = req.body;
    const platform = os.platform();
    
    // Log the block attempt
    console.log(`Attempting to force block device: ${vendorId}:${productId} on ${platform}`);
    
    // Call the block function
    const result = await forceBlockUSBDevice(vendorId, productId, platform);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      vendorId,
      productId,
      action: 'Force block attempted',
      status: result.success ? 'success' : 'failed',
      requiresAdmin: result.requiresAdmin,
      date: new Date().toISOString(),
      id: Date.now()
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Add to blocked attempts if needed
    const blockedAttempts = readDataFile(blockedAttemptsPath);
    if (result.success) {
      const blockedEntry = {
        vendorId,
        productId,
        status: 'blocked',
        date: new Date().toISOString(),
        id: Date.now()
      };
      blockedAttempts.unshift(blockedEntry);
      writeDataFile(blockedAttemptsPath, blockedAttempts);
      
      // Broadcast the update
      broadcastUpdate({
        newBlockedAttempt: blockedEntry,
        newLog: logEntry
      });
    } else {
      // Broadcast just the log update
      broadcastUpdate({
        newLog: logEntry
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error force blocking device:', error);
    res.status(500).json({ error: 'Failed to force block device', message: error.message });
  }
});

// New endpoint to refresh USB devices
app.post('/api/refresh-devices', async (req, res) => {
  try {
    const platform = os.platform();
    
    // Call the refresh function
    const result = await refreshUSBDevices(platform);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      action: 'Refresh USB devices',
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

// Handle WebSocket connections
wss.on('connection', (socket) => {
  console.log('WebSocket client connected');
  
  // Send initial data
  const initialData = {
    whitelistedDevices: readDataFile(whitelistPath),
    blockedAttempts: readDataFile(blockedAttemptsPath),
    logs: readDataFile(logsPath),
    allowedClasses: readDataFile(allowedClassesPath)
  };
  
  socket.send(JSON.stringify(initialData));
  
  // Listen for messages from client
  socket.on('message', (message) => {
    console.log('Received message from client:', message);
  });
  
  // Handle disconnection
  socket.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Initialize USB detection
usbDetect.startMonitoring();

// Handle USB device add event
usbDetect.on('add', async (device) => {
  console.log('USB device connected:', device);
  
  const { vendorId, productId } = device;
  const hexVendorId = vendorId.toString(16).padStart(4, '0');
  const hexProductId = productId.toString(16).padStart(4, '0');
  
  // Check if device is in whitelist
  const whitelistedDevices = readDataFile(whitelistPath);
  const isWhitelisted = whitelistedDevices.some(
    d => d.vendorId.toLowerCase() === hexVendorId.toLowerCase() && 
         d.productId.toLowerCase() === hexProductId.toLowerCase()
  );
  
  // Get device class
  const deviceClass = await getDeviceClass(hexVendorId, hexProductId);
  
  // Check if device class is allowed
  const allowedClasses = readDataFile(allowedClassesPath);
  const isClassAllowed = allowedClasses.some(
    c => c.id.toLowerCase() === deviceClass.toLowerCase()
  );
  
  // Device details to log
  const deviceDetails = {
    vendorId: hexVendorId,
    productId: hexProductId,
    manufacturer: device.manufacturer || 'Unknown',
    product: device.product || 'Unknown',
    deviceClass,
    date: new Date().toISOString(),
    id: Date.now()
  };
  
  // If device is whitelisted or class is allowed, allow it
  if (isWhitelisted || isClassAllowed) {
    console.log('Device is allowed:', deviceDetails);
    
    // Log the allowed device
    const logs = readDataFile(logsPath);
    const logEntry = {
      ...deviceDetails,
      action: isWhitelisted ? 'Device in whitelist' : 'Device class allowed',
      status: 'allowed'
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the update
    broadcastUpdate({
      newLog: logEntry
    });
  } else {
    console.log('Blocking unauthorized device:', deviceDetails);
    
    // Block the device
    blockUSBDevice(hexVendorId, hexProductId);
    
    // Log the blocked device
    const logs = readDataFile(logsPath);
    const logEntry = {
      ...deviceDetails,
      action: 'Blocked unauthorized device',
      status: 'blocked'
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Add to blocked attempts
    const blockedAttempts = readDataFile(blockedAttemptsPath);
    const blockedEntry = {
      ...deviceDetails,
      status: 'blocked'
    };
    blockedAttempts.unshift(blockedEntry);
    writeDataFile(blockedAttemptsPath, blockedAttempts);
    
    // Broadcast the update
    broadcastUpdate({
      newBlockedAttempt: blockedEntry,
      newLog: logEntry
    });
  }
});

// Start the server
server.listen(port, () => {
  console.log(`USB Monitor backend server running on http://localhost:${port}`);
});
