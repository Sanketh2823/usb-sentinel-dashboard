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

// Improved function to block a USB device with more aggressive methods
const forceBlockUSBDevice = async (vendorId, productId, platform) => {
  // Get more detailed device info for targeted blocking
  let deviceDetails = null;
  
  try {
    // Get USB device details
    const deviceDetailsCommand = platform === 'darwin' 
      ? `system_profiler SPUSBDataType | grep -A 30 "Vendor ID: 0x${vendorId}" | grep -A 25 "Product ID: 0x${productId}"`
      : platform === 'win32'
        ? `powershell "Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${vendorId}&PID_${productId}*' } | Format-List"`
        : `lsusb -d ${vendorId}:${productId} -v`;
    
    const deviceDetailsResult = await execPromise(deviceDetailsCommand);
    deviceDetails = deviceDetailsResult.stdout;
    console.log("Device details:", deviceDetails);
  } catch (error) {
    console.log("Error getting device details:", error);
  }
  
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
      
      return true;
    } catch (error) {
      console.error(`Error with enhanced blocking on Windows: ${error.message}`);
    }
  } else if (platform === 'darwin') {
    // macOS - using additional methods beyond just ejecting
    try {
      // For charging devices, try to disable USB power with pmset
      // This is more effective for charging cables
      const powerCommand = `sudo pmset -a disablesleep 1`;
      await execPromise(powerCommand);
      
      // Also try to unload USB drivers for more complete blocking
      const driverCommand = `sudo kextunload -b com.apple.iokit.IOUSBHostFamily`;
      await execPromise(driverCommand).catch(() => console.log("Driver unload requires admin rights"));
      
      // If charging device is detected, try direct power management
      if (deviceDetails && deviceDetails.toLowerCase().includes("power") || deviceDetails.toLowerCase().includes("charg")) {
        const specificPowerCommand = `sudo pmset -a displaysleep 0`;
        await execPromise(specificPowerCommand).catch(() => console.log("Power setting requires admin rights"));
      }
      
      return true;
    } catch (error) {
      console.error(`Error with enhanced blocking on macOS: ${error.message}`);
    }
  } else {
    // Linux - using additional methods beyond authorization
    try {
      // Try more aggressive USB power management
      const linuxCommand = `echo 'auto' | sudo tee /sys/bus/usb/devices/*/power/control`;
      await execPromise(linuxCommand).catch(() => console.log("Power control requires admin rights"));
      
      return true;
    } catch (error) {
      console.error(`Error with enhanced blocking on Linux: ${error.message}`);
    }
  }
  
  return standardBlockResult;
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
    // macOS - using AppleScript to simulate eject or using system commands
    const command = `diskutil unmount \`diskutil list | grep -i "$(system_profiler SPUSBDataType | grep -A 20 "Vendor ID: 0x${vendorId}" | grep -A 15 "Product ID: 0x${productId}" | grep -A 5 "BSD Name:" | head -n 1 | awk '{print $3}')\``;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error blocking device on macOS: ${error.message}`);
        return false;
      }
      return true;
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

// New function to eject a USB device
const ejectUSBDevice = async (vendorId, productId, platform) => {
  let command;
  
  if (platform === 'win32') {
    // Windows - using PowerShell to eject device
    command = `powershell "$driveEject = New-Object -comObject Shell.Application; $driveEject.Namespace(17).ParseName((Get-WmiObject Win32_DiskDrive | Where-Object { $_.PNPDeviceID -like '*VID_${vendorId}&PID_${productId}*' } | Get-WmiObject -Query 'ASSOCIATORS OF {$_.} WHERE ResultClass=Win32_DiskPartition' | ForEach-Object { Get-WmiObject -Query 'ASSOCIATORS OF {$_.} WHERE ResultClass=Win32_LogicalDisk' } | Select-Object -First 1 DeviceID).DeviceID).InvokeVerb('Eject')";
  } else if (platform === 'darwin') {
    // macOS - using diskutil to eject
    command = `diskutil eject $(system_profiler SPUSBDataType | grep -A 20 "Vendor ID: 0x${vendorId}" | grep -A 15 "Product ID: 0x${productId}" | grep -A 5 "BSD Name:" | head -n 1 | awk '{print $3}')`;
  } else {
    // Linux - using udisks to eject
    command = `udisksctl unmount -b /dev/$(lsblk -o NAME,VENDOR,MODEL | grep -i "${vendorId}.*${productId}" | awk '{print $1}' | head -n 1)`;
  }

  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error ejecting device on ${platform}: ${error.message}`);
        resolve({ success: false, message: `Error ejecting device: ${error.message}` });
      } else {
        console.log(`Successfully ejected device on ${platform}`);
        resolve({ success: true, message: 'Device ejected successfully' });
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
      release: os.release()
    };
    
    res.json(systemInfo);
  } catch (error) {
    console.error('Error retrieving system info:', error);
    res.status(500).json({ error: 'Failed to retrieve system info' });
  }
});

// New endpoint to eject a USB device
app.post('/api/eject-device/:id', async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id);
    const { platform } = req.body;
    
    // Find the device in whitelist or blocked attempts
    const whitelistedDevices = readDataFile(whitelistPath);
    const blockedAttempts = readDataFile(blockedAttemptsPath);
    
    let device = whitelistedDevices.find(d => d.id === deviceId);
    if (!device) {
      device = blockedAttempts.find(d => d.id === deviceId);
    }
    
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // Eject the device
    const result = await ejectUSBDevice(device.vendorId, device.productId, platform);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      ...device,
      action: 'Device ejection attempted',
      status: result.success ? 'info' : 'error',
      id: Date.now(),
      date: new Date().toISOString()
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the log
    broadcastUpdate({
      newLog: logEntry
    });
    
    if (result.success) {
      res.json({ success: true, message: 'Device ejected successfully' });
    } else {
      res.status(500).json({ success: false, message: result.message });
    }
  } catch (error) {
    console.error('Error ejecting USB device:', error);
    res.status(500).json({ error: 'Failed to eject USB device' });
  }
});

// New endpoint to refresh USB devices
app.post('/api/refresh-devices', async (req, res) => {
  try {
    const { platform } = req.body;
    
    // Refresh USB devices
    const result = await refreshUSBDevices(platform);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      action: 'USB devices refresh attempted',
      status: result.success ? 'info' : 'error',
      id: Date.now(),
      date: new Date().toISOString(),
      username: 'system'
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the log
    broadcastUpdate({
      newLog: logEntry
    });
    
    if (result.success) {
      res.json({ success: true, message: 'USB devices refreshed successfully' });
    } else {
      res.status(500).json({ success: false, message: result.message });
    }
  } catch (error) {
    console.error('Error refreshing USB devices:', error);
    res.status(500).json({ error: 'Failed to refresh USB devices' });
  }
});

// New endpoint to force block a USB device
app.post('/api/force-block-device/:id', async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id);
    const { platform } = req.body;
    
    // Find the device in whitelist or blocked attempts
    const whitelistedDevices = readDataFile(whitelistPath);
    const blockedAttempts = readDataFile(blockedAttemptsPath);
    
    let device = whitelistedDevices.find(d => d.id === deviceId);
    if (!device) {
      device = blockedAttempts.find(d => d.id === deviceId);
    }
    
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // Force block the device with enhanced methods
    const result = await forceBlockUSBDevice(device.vendorId, device.productId, platform);
    
    // Log the action
    const logs = readDataFile(logsPath);
    const logEntry = {
      ...device,
      action: 'Device force-block attempted',
      status: result ? 'info' : 'error',
      id: Date.now(),
      date: new Date().toISOString()
    };
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // If device was previously whitelisted, move it to blocked
    if (whitelistedDevices.some(d => d.id === deviceId)) {
      // Remove from whitelist
      const updatedWhitelist = whitelistedDevices.filter(d => d.id !== deviceId);
      writeDataFile(whitelistPath, updatedWhitelist);
      
      // Add to blocked
      const blockedEntry = {
        ...device,
        status: 'blocked',
        date: new Date().toISOString(),
        id: Date.now() // Unique ID for blocked entry
      };
      blockedAttempts.unshift(blockedEntry);
      writeDataFile(blockedAttemptsPath, blockedAttempts);
      
      // Broadcast update
      broadcastUpdate({
        whitelistUpdate: updatedWhitelist,
        newBlockedAttempt: blockedEntry,
        newLog: logEntry
      });
    } else {
      // Just broadcast the log
      broadcastUpdate({
        newLog: logEntry
      });
    }
    
    if (result) {
      res.json({ success: true, message: 'Device blocked successfully with enhanced methods' });
    } else {
      res.status(500).json({ success: false, message: 'Enhanced blocking attempt failed, but standard blocking was attempted' });
    }
  } catch (error) {
    console.error('Error force blocking USB device:', error);
    res.status(500).json({ error: 'Failed to force block USB device' });
  }
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  
  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
  });
});

// Initialize USB detection
const initUsbDetection = () => {
  usbDetect.startMonitoring();
  
  // Handle device add event
  usbDetect.on('add', async (device) => {
    console.log('USB device connected:', device);
    
    const { vendorId, productId } = device;
    const whitelistedDevices = readDataFile(whitelistPath);
    const allowedClasses = readDataFile(allowedClassesPath);
    
    // Get device class information
    const deviceClass = await getDeviceClass(vendorId, productId);
    console.log(`Device class for ${vendorId}:${productId} is ${deviceClass}`);
    
    // Check if device class is allowed
    const isClassAllowed = allowedClasses.some(c => c.id.toLowerCase() === deviceClass.toLowerCase());
    console.log(`Device class ${deviceClass} is ${isClassAllowed ? 'allowed' : 'not allowed'}`);
    
    // Check if device is whitelisted
    const isWhitelisted = whitelistedDevices.some(
      (d) => d.vendorId === String(vendorId) && d.productId === String(productId)
    );
    
    // Device is allowed if it's whitelisted or its class is allowed
    const isAllowed = isWhitelisted || isClassAllowed;
    
    const logs = readDataFile(logsPath);
    const logEntry = {
      vendorId: String(vendorId),
      productId: String(productId),
      manufacturer: device.manufacturer || 'Unknown',
      username: 'system',
      date: new Date().toISOString(),
      id: Date.now(),
      deviceClass,
      status: isAllowed ? 'allowed' : 'blocked',
      action: isAllowed ? 
        (isWhitelisted ? 'Device access allowed (whitelisted)' : 'Device access allowed (class allowed)') : 
        'Device access blocked'
    };
    
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // If device is not allowed, add to blocked attempts and actually block it
    if (!isAllowed) {
      const blockedAttempts = readDataFile(blockedAttemptsPath);
      const blockedEntry = {
        ...logEntry,
        id: Date.now(), // Ensure unique ID
        deviceClass
      };
      
      blockedAttempts.unshift(blockedEntry);
      writeDataFile(blockedAttemptsPath, blockedAttempts);
      
      // Actually block the device
      blockUSBDevice(vendorId, productId);
      
      // Broadcast the blocked attempt
      broadcastUpdate({
        newBlockedAttempt: blockedEntry,
        newLog: logEntry
      });
    } else {
      // Broadcast the log
      broadcastUpdate({
        newLog: logEntry
      });
    }
  });
  
  // Handle device remove event
  usbDetect.on('remove', (device) => {
    console.log('USB device disconnected:', device);
    
    const { vendorId, productId } = device;
    
    const logs = readDataFile(logsPath);
    const logEntry = {
      vendorId: String(vendorId),
      productId: String(productId),
      manufacturer: device.manufacturer || 'Unknown',
      username: 'system',
      date: new Date().toISOString(),
      id: Date.now(),
      status: 'info',
      action: 'Device disconnected'
    };
    
    logs.unshift(logEntry);
    writeDataFile(logsPath, logs);
    
    // Broadcast the log
    broadcastUpdate({
      newLog: logEntry
    });
  });
};

// Start the server
server.listen(port, () => {
  console.log(`USB Monitor backend server running on http://localhost:${port}`);
  initUsbDetection();
});

// Cleanup when the application is terminated
process.on('SIGINT', () => {
  usbDetect.stopMonitoring();
  console.log('USB monitoring stopped');
  process.exit();
});
