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

// Improved function to block a USB device - runs with administrative privileges
const blockUSBDevice = async (vendorId, productId) => {
  console.log(`Attempting to block device ${vendorId}:${productId} with admin privileges...`);
  const platform = os.platform();
  
  if (platform === 'win32') {
    // Windows - using PnPUtil with specific device targeting
    // This requires running the Node process as Administrator
    console.log(`Blocking USB device on Windows: ${vendorId}:${productId}`);
    const command = `powershell "Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${vendorId}&PID_${productId}*' } | Disable-PnpDevice -Confirm:$false"`;
    
    return new Promise((resolve) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error blocking device on Windows: ${error.message}`);
          if (error.message.includes('access is denied') || error.message.includes('privileges')) {
            console.error('This operation requires administrative privileges. Please run the server as Administrator.');
          }
          resolve(false);
        } else {
          console.log(`Successfully blocked device on Windows: ${stdout}`);
          resolve(true);
        }
      });
    });
  } else if (platform === 'darwin') {
    // macOS - improved approach with detailed error handling
    // Uses a more aggressive approach to prevent device mounting
    console.log(`Blocking USB device on macOS: ${vendorId}:${productId}`);
    
    // First, try to find the device in the system
    const findCommand = `system_profiler SPUSBDataType | grep -A 20 "Vendor ID: 0x${vendorId}" | grep -A 15 "Product ID: 0x${productId}"`;
    
    return new Promise((resolve) => {
      exec(findCommand, (error, stdout, stderr) => {
        if (error || !stdout) {
          console.error(`Error finding device on macOS: ${error?.message || 'Device not found'}`);
          resolve(false);
          return;
        }
        
        // Try to find any mounted volumes associated with this device
        const bsdNameCmd = `system_profiler SPUSBDataType | grep -A 20 "Vendor ID: 0x${vendorId}" | grep -A 15 "Product ID: 0x${productId}" | grep -A 5 "BSD Name:" | head -n 1`;
        
        exec(bsdNameCmd, (error, bsdOutput, stderr) => {
          if (!error && bsdOutput) {
            const bsdMatch = bsdOutput.match(/BSD Name: (.*)/);
            if (bsdMatch && bsdMatch[1]) {
              const bsdName = bsdMatch[1].trim();
              // Block using more aggressive approach that requires sudo
              const blockCmd = `sudo diskutil unmountDisk force /dev/${bsdName} && sudo kextunload -b com.apple.driver.usb.${bsdName}`;
              
              exec(blockCmd, (error, blockOutput, stderr) => {
                if (error) {
                  console.error(`Error blocking device on macOS: ${error.message}`);
                  if (error.message.includes('permission denied') || error.message.includes('privileges')) {
                    console.error('This operation requires administrative privileges. Please run the server with sudo.');
                  }
                  resolve(false);
                } else {
                  console.log(`Successfully blocked device on macOS: ${blockOutput}`);
                  resolve(true);
                }
              });
            } else {
              console.error('Could not find BSD name for the device');
              resolve(false);
            }
          } else {
            console.error('Could not find BSD information for the device');
            resolve(false);
          }
        });
      });
    });
  } else {
    // Linux - improved approach that works with udev rules
    // This requires running with sudo
    console.log(`Blocking USB device on Linux: ${vendorId}:${productId}`);
    
    // First find the USB bus and device number
    const findCommand = `lsusb | grep -i "${vendorId}:${productId}"`;
    
    return new Promise((resolve) => {
      exec(findCommand, (error, stdout, stderr) => {
        if (error || !stdout) {
          console.error(`Error finding device on Linux: ${error?.message || 'Device not found'}`);
          resolve(false);
          return;
        }
        
        // Parse bus and device number from lsusb output
        // Format: Bus 001 Device 002: ID 8087:0024 Intel Corp.
        const match = stdout.match(/Bus (\d+) Device (\d+):/);
        if (match && match[1] && match[2]) {
          const bus = match[1];
          const device = match[2];
          
          // Use authoritative approach to disable the device
          // This requires sudo privileges
          const blockCmd = `sudo bash -c "echo 0 > /sys/bus/usb/devices/${bus}-${device}/authorized"`;
          
          exec(blockCmd, (error, blockOutput, stderr) => {
            if (error) {
              console.error(`Error blocking device on Linux: ${error.message}`);
              if (error.message.includes('permission denied') || error.message.includes('privileges')) {
                console.error('This operation requires root privileges. Please run the server with sudo.');
              }
              resolve(false);
            } else {
              console.log(`Successfully blocked device on Linux`);
              resolve(true);
            }
          });
        } else {
          console.error('Could not parse USB bus and device number');
          resolve(false);
        }
      });
    });
  }
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

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  
  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
  });
});

// Enhanced USB detection with early blocking
const initUsbDetection = () => {
  usbDetect.startMonitoring();
  
  // Handle device add event with improved blocking logic
  usbDetect.on('add', async (device) => {
    console.log('USB device connected:', device);
    
    const { vendorId, productId } = device;
    const whitelistedDevices = readDataFile(whitelistPath);
    const allowedClasses = readDataFile(allowedClassesPath);
    
    // IMPORTANT: Check whitelist FIRST before anything else
    // This is crucial for proper blocking before system reads the device
    const isWhitelisted = whitelistedDevices.some(
      (d) => d.vendorId === String(vendorId) && d.productId === String(productId)
    );
    
    // Only get device class if not whitelisted (optimization)
    let deviceClass = "FF";
    let isClassAllowed = false;
    
    if (!isWhitelisted) {
      // Get device class information
      deviceClass = await getDeviceClass(vendorId, productId);
      console.log(`Device class for ${vendorId}:${productId} is ${deviceClass}`);
      
      // Check if device class is allowed
      isClassAllowed = allowedClasses.some(c => c.id.toLowerCase() === deviceClass.toLowerCase());
      console.log(`Device class ${deviceClass} is ${isClassAllowed ? 'allowed' : 'not allowed'}`);
    }
    
    // Device is allowed if it's whitelisted or its class is allowed
    const isAllowed = isWhitelisted || isClassAllowed;
    
    // Create log entry
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
      
      // IMPORTANT: Actually block the device - this now runs with improved logic
      const blockResult = await blockUSBDevice(vendorId, productId);
      
      // Update log with block result
      const blockResultLog = {
        ...logEntry,
        id: Date.now(),
        action: blockResult ? 
          'Device successfully blocked' : 
          'Device block attempted but may require administrator privileges',
        status: blockResult ? 'blocked' : 'warning'
      };
      
      logs.unshift(blockResultLog);
      writeDataFile(logsPath, logs);
      
      // Broadcast the blocked attempt and updated log
      broadcastUpdate({
        newBlockedAttempt: blockedEntry,
        newLog: blockResultLog
      });
    } else {
      // Broadcast the log for allowed device
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
