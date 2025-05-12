
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { readDataFile, writeDataFile, logsPath, whitelistPath } = require('../config');
const { formatDeviceIds } = require('../helpers/whitelist');

// Path to store Devcon utility
const devconDir = path.join(os.homedir(), '.usb-monitor');
const devconPath = path.join(devconDir, 'devcon.exe');

// Check if Devcon is installed, if not extract it from resources
const setupDevcon = () => {
  try {
    if (!fs.existsSync(devconDir)) {
      fs.mkdirSync(devconDir, { recursive: true });
    }
    
    // Check if Devcon already exists
    if (!fs.existsSync(devconPath)) {
      console.log('Devcon not found. Installing from bundled resources...');
      
      // Path to bundled devcon.exe (you'll need to include this in your project)
      const bundledDevcon = path.join(__dirname, '..', '..', 'resources', 'devcon.exe');
      
      if (fs.existsSync(bundledDevcon)) {
        fs.copyFileSync(bundledDevcon, devconPath);
        console.log('Devcon installed successfully.');
      } else {
        console.error('Bundled Devcon not found. Please download Devcon from Windows SDK and place it in the resources folder.');
        return false;
      }
    }
    return true;
  } catch (error) {
    console.error('Error setting up Devcon:', error);
    return false;
  }
};

// Get all USB devices with PowerShell
const getAllUsbDevices = async () => {
  return new Promise((resolve, reject) => {
    const command = `powershell -Command "Get-PnpDevice -Class USB | Where-Object { $_.Status -eq 'OK' } | Select-Object Status, Class, FriendlyName, InstanceId, DeviceID | ConvertTo-Json"`;
    
    exec(command, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error getting USB devices: ${error.message}`);
        reject(error);
        return;
      }
      
      try {
        const devices = JSON.parse(stdout);
        resolve(Array.isArray(devices) ? devices : [devices]);
      } catch (parseError) {
        console.error('Error parsing USB devices:', parseError);
        reject(parseError);
      }
    });
  });
};

// Extract VID/PID from device ID
const extractVidPid = (deviceId) => {
  try {
    const vidMatch = deviceId.match(/VID_([0-9A-F]{4})/i);
    const pidMatch = deviceId.match(/PID_([0-9A-F]{4})/i);
    
    if (vidMatch && pidMatch) {
      return {
        vendorId: vidMatch[1].toLowerCase(),
        productId: pidMatch[1].toLowerCase()
      };
    }
    return null;
  } catch (error) {
    console.error('Error extracting VID/PID:', error);
    return null;
  }
};

// Block a specific USB device on Windows
const blockUsbDeviceOnWindows = async (vendorId, productId) => {
  console.log(`Attempting to block USB device ${vendorId}:${productId} on Windows`);
  
  try {
    // Normalize the VID/PID format
    const normalized = formatDeviceIds({ vendorId, productId });
    
    // Check if Devcon is available
    if (!setupDevcon()) {
      console.log('Falling back to PowerShell for device blocking...');
      
      // Use PowerShell as fallback
      const command = `powershell -Command "& {
        $devices = Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${normalized.vendorId}&PID_${normalized.productId}*' };
        foreach ($device in $devices) {
          Write-Output ('Disabling device: ' + $device.FriendlyName);
          Disable-PnpDevice -InstanceId $device.InstanceId -Confirm:$false;
        }
      }"`;
      
      return new Promise((resolve) => {
        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error blocking device with PowerShell: ${error.message}`);
            resolve({ success: false, message: error.message });
            return;
          }
          
          console.log(`PowerShell blocking output: ${stdout}`);
          resolve({ success: true, message: 'Device blocked successfully using PowerShell' });
        });
      });
    }
    
    // Use Devcon for more reliable device management
    const command = `"${devconPath}" disable "*VID_${normalized.vendorId}&PID_${normalized.productId}*"`;
    
    return new Promise((resolve) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error blocking device with Devcon: ${error.message}`);
          resolve({ success: false, message: error.message });
          return;
        }
        
        console.log(`Devcon blocking output: ${stdout}`);
        resolve({ success: true, message: 'Device blocked successfully using Devcon' });
      });
    });
  } catch (error) {
    console.error(`Error in Windows device blocking:`, error);
    return { success: false, message: error.message };
  }
};

// Unblock a specific USB device on Windows
const unblockUsbDeviceOnWindows = async (vendorId, productId) => {
  console.log(`Attempting to unblock USB device ${vendorId}:${productId} on Windows`);
  
  try {
    // Normalize the VID/PID format
    const normalized = formatDeviceIds({ vendorId, productId });
    
    // Check if Devcon is available
    if (!setupDevcon()) {
      console.log('Falling back to PowerShell for device unblocking...');
      
      // Use PowerShell as fallback
      const command = `powershell -Command "& {
        $devices = Get-PnpDevice | Where-Object { $_.HardwareID -like '*VID_${normalized.vendorId}&PID_${normalized.productId}*' };
        foreach ($device in $devices) {
          Write-Output ('Enabling device: ' + $device.FriendlyName);
          Enable-PnpDevice -InstanceId $device.InstanceId -Confirm:$false;
        }
      }"`;
      
      return new Promise((resolve) => {
        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error unblocking device with PowerShell: ${error.message}`);
            resolve({ success: false, message: error.message });
            return;
          }
          
          console.log(`PowerShell unblocking output: ${stdout}`);
          resolve({ success: true, message: 'Device unblocked successfully using PowerShell' });
        });
      });
    }
    
    // Use Devcon for more reliable device management
    const command = `"${devconPath}" enable "*VID_${normalized.vendorId}&PID_${normalized.productId}*"`;
    
    return new Promise((resolve) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error unblocking device with Devcon: ${error.message}`);
          resolve({ success: false, message: error.message });
          return;
        }
        
        console.log(`Devcon unblocking output: ${stdout}`);
        resolve({ success: true, message: 'Device unblocked successfully using Devcon' });
      });
    });
  } catch (error) {
    console.error(`Error in Windows device unblocking:`, error);
    return { success: false, message: error.message };
  }
};

// Start monitoring for USB insertions/removals using WMI Event Subscription
const startUsbMonitoring = (callback) => {
  const monitorScript = `
  $query = "SELECT * FROM __InstanceOperationEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_USBHub'"
  Register-WmiEvent -Query $query -Action {
    $device = $Event.SourceEventArgs.NewEvent.TargetInstance
    $deviceId = $device.DeviceID

    # Determine event type
    $eventType = $Event.SourceEventArgs.NewEvent.__CLASS
    
    # Set action based on event type
    if ($eventType -like '*CreationEvent') {
      $action = 'inserted'
    } elseif ($eventType -like '*DeletionEvent') {
      $action = 'removed'
    } else {
      $action = 'modified'
    }

    # Get device info through additional PowerShell command
    $deviceInfo = Get-PnpDevice | Where-Object { $_.InstanceId -like "*$deviceId*" } | Select-Object Status, Class, FriendlyName, InstanceId, DeviceID
    
    # Write to a temp file that Node.js can read
    $output = @{
      action = $action
      deviceId = $deviceId
      friendlyName = $deviceInfo.FriendlyName
      instanceId = $deviceInfo.InstanceId
      status = $deviceInfo.Status
    } | ConvertTo-Json

    # Write the event to a temp file that Node.js will poll
    $output | Out-File -FilePath "$env:TEMP\\usb_monitor_event.json" -Encoding utf8
  }

  # Keep the script running
  while ($true) { Start-Sleep -Seconds 1 }
  `;

  const scriptPath = path.join(os.tmpdir(), 'usb_monitor.ps1');
  fs.writeFileSync(scriptPath, monitorScript);
  
  // Start PowerShell script in background
  const ps = exec(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, (error) => {
    if (error) {
      console.error(`Error in USB monitoring process: ${error.message}`);
    }
  });
  
  console.log('Started USB device monitoring on Windows...');
  
  // Set up polling to check for new USB events
  const pollInterval = setInterval(() => {
    const eventFilePath = path.join(os.tmpdir(), 'usb_monitor_event.json');
    
    if (fs.existsSync(eventFilePath)) {
      try {
        const eventData = JSON.parse(fs.readFileSync(eventFilePath, 'utf8'));
        fs.unlinkSync(eventFilePath); // Remove the file after reading
        
        // Get additional device info including VID/PID
        if (eventData.instanceId) {
          getAllUsbDevices().then(devices => {
            const matchingDevice = devices.find(d => 
              d.InstanceId === eventData.instanceId || 
              (d.DeviceID && d.DeviceID.includes(eventData.deviceId))
            );
            
            if (matchingDevice) {
              const vidPid = extractVidPid(matchingDevice.InstanceId || matchingDevice.DeviceID);
              
              if (vidPid) {
                eventData.vendorId = vidPid.vendorId;
                eventData.productId = vidPid.productId;
              }
            }
            
            // Execute callback with the event data
            if (callback && typeof callback === 'function') {
              callback(eventData);
            }
          }).catch(err => {
            console.error('Error getting device details:', err);
          });
        }
      } catch (error) {
        console.error('Error processing USB event data:', error);
      }
    }
  }, 1000);
  
  return {
    stop: () => {
      clearInterval(pollInterval);
      // Kill the PowerShell process
      exec('taskkill /f /im powershell.exe /fi "WINDOWTITLE eq *usb_monitor*"');
      console.log('Stopped USB device monitoring');
    }
  };
};

module.exports = {
  blockUsbDeviceOnWindows,
  unblockUsbDeviceOnWindows,
  startUsbMonitoring,
  getAllUsbDevices,
  extractVidPid,
  setupDevcon
};
