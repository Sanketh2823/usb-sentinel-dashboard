
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { readDataFile, writeDataFile, logsPath } = require('../config');
const { formatDeviceIds } = require('../helpers/whitelist');

// Install required dependencies for USB monitoring
const setupLinuxDependencies = () => {
  try {
    console.log('Checking Linux dependencies for USB monitoring...');
    
    // Check if udevadm exists
    try {
      execSync('which udevadm', { stdio: 'ignore' });
    } catch (error) {
      console.log('udev not found, installing...');
      execSync('sudo apt-get update && sudo apt-get install -y udev', { stdio: 'inherit' });
    }
    
    // Check if libusb tools are installed
    try {
      execSync('which lsusb', { stdio: 'ignore' });
    } catch (error) {
      console.log('USB utilities not found, installing...');
      execSync('sudo apt-get update && sudo apt-get install -y usbutils', { stdio: 'inherit' });
    }
    
    // Create udev rules for blocking USB devices
    const udevRulesDir = '/etc/udev/rules.d';
    const udevRuleFile = path.join(udevRulesDir, '99-usb-monitor.rules');
    
    if (!fs.existsSync(udevRuleFile)) {
      const rule = `# USB Monitor block rules\n# This file will be populated by the USB Monitor application\n`;
      try {
        execSync(`echo "${rule}" | sudo tee ${udevRuleFile}`);
        execSync('sudo chmod 644 /etc/udev/rules.d/99-usb-monitor.rules');
        execSync('sudo udevadm control --reload-rules');
      } catch (error) {
        console.error('Error creating udev rules:', error);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error setting up Linux dependencies:', error);
    return false;
  }
};

// Get all currently connected USB devices
const getAllUsbDevices = async () => {
  return new Promise((resolve, reject) => {
    exec('lsusb', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error getting USB devices: ${error.message}`);
        reject(error);
        return;
      }
      
      try {
        const devices = [];
        const lines = stdout.split('\n');
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          // Parse lsusb output format: "Bus 001 Device 002: ID 8087:0024 Intel Corp."
          const match = line.match(/Bus\s+(\d+)\s+Device\s+(\d+):\s+ID\s+([0-9a-f]{4}):([0-9a-f]{4})\s*(.*)?/i);
          
          if (match) {
            const [, bus, device, vendorId, productId, description] = match;
            
            devices.push({
              bus,
              device,
              vendorId: vendorId.toLowerCase(),
              productId: productId.toLowerCase(),
              description: description ? description.trim() : 'Unknown Device',
              path: `/dev/bus/usb/${bus.padStart(3, '0')}/${device.padStart(3, '0')}`
            });
          }
        }
        
        resolve(devices);
      } catch (parseError) {
        console.error('Error parsing USB devices:', parseError);
        reject(parseError);
      }
    });
  });
};

// Block a specific USB device on Linux using udev rules and/or USB authorization
const blockUsbDeviceOnLinux = async (vendorId, productId) => {
  console.log(`Attempting to block USB device ${vendorId}:${productId} on Linux`);
  
  try {
    // Normalize the VID/PID format
    const normalized = formatDeviceIds({ vendorId, productId });
    
    // Method 1: Use USB authorization (requires root)
    const authorizeCommand = `
      for dev in /sys/bus/usb/devices/*; do
        if [ -e "$dev/idVendor" ] && [ -e "$dev/idProduct" ] && [ $(cat "$dev/idVendor") = "${normalized.vendorId}" ] && [ $(cat "$dev/idProduct") = "${normalized.productId}" ]; then
          echo "Found device at $dev"
          echo 0 > "$dev/authorized"
          echo "Blocked device: $(cat "$dev/manufacturer") $(cat "$dev/product")"
        fi
      done
    `;
    
    try {
      execSync(`sudo bash -c '${authorizeCommand}'`);
      console.log(`Device blocked through USB authorization mechanism`);
    } catch (authError) {
      console.error(`Error blocking through authorization: ${authError.message}`);
    }
    
    // Method 2: Add udev rule (persistent across reboots)
    const udevRule = `# Block USB device ${normalized.vendorId}:${normalized.productId}\nATTR{idVendor}=="${normalized.vendorId}", ATTR{idProduct}=="${normalized.productId}", RUN+="/bin/sh -c 'echo 0 > /sys/%p/authorized'"`;
    
    try {
      const rulePath = '/etc/udev/rules.d/99-usb-monitor.rules';
      execSync(`echo '${udevRule}' | sudo tee -a ${rulePath}`);
      execSync('sudo udevadm control --reload-rules');
      execSync('sudo udevadm trigger');
      
      console.log(`Added persistent udev rule for device ${normalized.vendorId}:${normalized.productId}`);
    } catch (udevError) {
      console.error(`Error adding udev rule: ${udevError.message}`);
    }
    
    return { success: true, message: 'Device blocked successfully' };
  } catch (error) {
    console.error(`Error in Linux device blocking:`, error);
    return { success: false, message: error.message };
  }
};

// Unblock a specific USB device on Linux
const unblockUsbDeviceOnLinux = async (vendorId, productId) => {
  console.log(`Attempting to unblock USB device ${vendorId}:${productId} on Linux`);
  
  try {
    // Normalize the VID/PID format
    const normalized = formatDeviceIds({ vendorId, productId });
    
    // Method 1: Use USB authorization to re-authorize
    const authorizeCommand = `
      for dev in /sys/bus/usb/devices/*; do
        if [ -e "$dev/idVendor" ] && [ -e "$dev/idProduct" ] && [ $(cat "$dev/idVendor") = "${normalized.vendorId}" ] && [ $(cat "$dev/idProduct") = "${normalized.productId}" ]; then
          echo "Found device at $dev"
          echo 1 > "$dev/authorized"
          echo "Unblocked device: $(cat "$dev/manufacturer") $(cat "$dev/product")"
        fi
      done
    `;
    
    try {
      execSync(`sudo bash -c '${authorizeCommand}'`);
      console.log(`Device unblocked through USB authorization mechanism`);
    } catch (authError) {
      console.error(`Error unblocking through authorization: ${authError.message}`);
    }
    
    // Method 2: Remove from udev rules
    try {
      const rulePath = '/etc/udev/rules.d/99-usb-monitor.rules';
      const currentRules = fs.readFileSync(rulePath, 'utf8');
      
      // Remove the specific rule for this device
      const updatedRules = currentRules
        .split('\n')
        .filter(line => !line.includes(`ATTR{idVendor}=="${normalized.vendorId}", ATTR{idProduct}=="${normalized.productId}"`))
        .join('\n');
      
      execSync(`echo '${updatedRules}' | sudo tee ${rulePath}`);
      execSync('sudo udevadm control --reload-rules');
      execSync('sudo udevadm trigger');
      
      console.log(`Removed udev rule for device ${normalized.vendorId}:${normalized.productId}`);
    } catch (udevError) {
      console.error(`Error removing udev rule: ${udevError.message}`);
    }
    
    return { success: true, message: 'Device unblocked successfully' };
  } catch (error) {
    console.error(`Error in Linux device unblocking:`, error);
    return { success: false, message: error.message };
  }
};

// Start monitoring for USB insertions/removals
const startUsbMonitoring = (callback) => {
  // Setup monitor script
  const monitorScript = `
    #!/bin/bash
    # USB monitor script
    
    # Initial device list
    initial_devices=$(lsusb)
    
    function get_device_info() {
      local vendor_id="$1"
      local product_id="$2"
      
      # Get detailed device info
      local device_info=$(lsusb -v -d $vendor_id:$product_id 2>/dev/null)
      local manufacturer=$(echo "$device_info" | grep -i "iManufacturer" | head -n 1 | sed 's/.*iManufacturer.*[0-9] //g')
      local product=$(echo "$device_info" | grep -i "iProduct" | head -n 1 | sed 's/.*iProduct.*[0-9] //g')
      
      echo "{\"manufacturer\": \"$manufacturer\", \"product\": \"$product\"}"
    }
    
    # Function to parse lsusb output and extract device info
    function parse_usb_devices() {
      local devices="$1"
      local result="["
      local first=true
      
      while read -r line; do
        if [[ ! -z "$line" ]]; then
          # Parse lsusb output format: "Bus 001 Device 002: ID 8087:0024 Intel Corp."
          if [[ "$line" =~ Bus\ ([0-9]+)\ Device\ ([0-9]+):\ ID\ ([0-9a-f]+):([0-9a-f]+)(.*)$ ]]; then
            bus="${BASH_REMATCH[1]}"
            device="${BASH_REMATCH[2]}"
            vendor_id="${BASH_REMATCH[3]}"
            product_id="${BASH_REMATCH[4]}"
            description="${BASH_REMATCH[5]}"
            
            # Get additional device info
            device_info=$(get_device_info "$vendor_id" "$product_id")
            
            if [[ "$first" != "true" ]]; then
              result+=","
            fi
            first=false
            
            result+="{\"bus\":\"$bus\",\"device\":\"$device\",\"vendorId\":\"$vendor_id\",\"productId\":\"$product_id\",\"description\":\"${description# }\",\"deviceInfo\":$device_info}"
          fi
        fi
      done <<< "$devices"
      
      result+="]"
      echo "$result"
    }
    
    # Monitor loop
    while true; do
      current_devices=$(lsusb)
      
      # Check for new devices (inserted)
      while read -r line; do
        if [[ ! -z "$line" ]] && ! grep -q "$line" <<< "$initial_devices"; then
          if [[ "$line" =~ Bus\ ([0-9]+)\ Device\ ([0-9]+):\ ID\ ([0-9a-f]+):([0-9a-f]+)(.*)$ ]]; then
            vendor_id="${BASH_REMATCH[3]}"
            product_id="${BASH_REMATCH[4]}"
            description="${BASH_REMATCH[5]}"
            
            device_info=$(get_device_info "$vendor_id" "$product_id")
            echo "{\"action\":\"inserted\",\"vendorId\":\"$vendor_id\",\"productId\":\"$product_id\",\"description\":\"${description# }\",\"deviceInfo\":$device_info}" > /tmp/usb_event.json
          fi
        fi
      done <<< "$current_devices"
      
      # Check for removed devices
      while read -r line; do
        if [[ ! -z "$line" ]] && ! grep -q "$line" <<< "$current_devices"; then
          if [[ "$line" =~ Bus\ ([0-9]+)\ Device\ ([0-9]+):\ ID\ ([0-9a-f]+):([0-9a-f]+)(.*)$ ]]; then
            vendor_id="${BASH_REMATCH[3]}"
            product_id="${BASH_REMATCH[4]}"
            description="${BASH_REMATCH[5]}"
            
            echo "{\"action\":\"removed\",\"vendorId\":\"$vendor_id\",\"productId\":\"$product_id\",\"description\":\"${description# }\"}" > /tmp/usb_event.json
          fi
        fi
      done <<< "$initial_devices"
      
      # Update initial device list
      initial_devices="$current_devices"
      
      # Sleep to avoid high CPU usage
      sleep 1
    done
  `;
  
  const scriptPath = path.join(os.tmpdir(), 'usb_monitor.sh');
  fs.writeFileSync(scriptPath, monitorScript);
  fs.chmodSync(scriptPath, '755'); // Make executable
  
  // Start the bash script
  const monitor = exec(`bash ${scriptPath}`, (error) => {
    if (error) {
      console.error(`Error in USB monitoring process: ${error.message}`);
    }
  });
  
  console.log('Started USB device monitoring on Linux...');
  
  // Poll for events
  const pollInterval = setInterval(() => {
    const eventFilePath = '/tmp/usb_event.json';
    
    if (fs.existsSync(eventFilePath)) {
      try {
        const eventData = JSON.parse(fs.readFileSync(eventFilePath, 'utf8'));
        fs.unlinkSync(eventFilePath); // Remove the file after reading
        
        // Execute callback with the event data
        if (callback && typeof callback === 'function') {
          callback(eventData);
        }
      } catch (error) {
        console.error('Error processing USB event data:', error);
      }
    }
  }, 1000);
  
  return {
    stop: () => {
      clearInterval(pollInterval);
      monitor.kill();
      console.log('Stopped USB device monitoring');
    }
  };
};

module.exports = {
  setupLinuxDependencies,
  blockUsbDeviceOnLinux,
  unblockUsbDeviceOnLinux,
  startUsbMonitoring,
  getAllUsbDevices
};
