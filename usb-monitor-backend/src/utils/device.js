
const os = require('os');
const { exec } = require('child_process');
const { execPromise } = require('./system');

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

module.exports = {
  getDeviceClass
};
