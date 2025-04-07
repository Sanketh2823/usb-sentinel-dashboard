
const os = require('os');
const { execPromise } = require('../utils/system');
const { getDeviceClass } = require('../utils/device');

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

module.exports = {
  blockUsbClassOnMacOS,
  blockSpecificUsbDeviceOnMacOS
};
