
const fs = require('fs').promises;
const { execSync } = require('child_process');
const os = require('os');
const path = require('path');

class DeviceManager {
  constructor() {
    this.blockedDevices = new Map();
    this.whitelistedDevices = new Map();
    this.blockingFiles = {
      launchDaemon: '/Library/LaunchDaemons/com.usbmonitor.blockusb.plist',
      enhanced: '/Library/LaunchDaemons/com.usbmonitor.enhanced.plist',
      userAgent: path.join(os.homedir(), 'Library/LaunchAgents/com.usbmonitor.plist')
    };
  }

  async isDeviceBlocked(vendorId, productId) {
    const deviceKey = `${vendorId}:${productId}`;
    return this.blockedDevices.has(deviceKey);
  }

  async blockDevice(vendorId, productId) {
    const deviceKey = `${vendorId}:${productId}`;
    this.blockedDevices.set(deviceKey, true);
    
    // Create device-specific blocking rule instead of system-wide
    const blockScript = `#!/bin/bash
# USB Block Script for device ${deviceKey}
ioreg -p IOUSB -w0 | grep -B 2 "idVendor = ${vendorId}" | grep -B 2 "idProduct = ${productId}" || true`;

    const scriptPath = `/tmp/usb_block_${vendorId}_${productId}.sh`;
    await fs.writeFile(scriptPath, blockScript);
    await fs.chmod(scriptPath, '755');
    
    return true;
  }

  async unblockDevice(vendorId, productId) {
    const deviceKey = `${vendorId}:${productId}`;
    this.blockedDevices.delete(deviceKey);
    
    // Remove device-specific blocking file
    const scriptPath = `/tmp/usb_block_${vendorId}_${productId}.sh`;
    try {
      await fs.unlink(scriptPath);
    } catch (err) {
      console.log(`No blocking script found for ${deviceKey}`);
    }
    
    // Remove from whitelisted devices if present
    this.whitelistedDevices.delete(deviceKey);
    
    return true;
  }

  async cleanupBlockingFiles() {
    try {
      for (const [path, file] of Object.entries(this.blockingFiles)) {
        try {
          await fs.unlink(file);
          console.log(`Removed blocking file: ${file}`);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            console.error(`Error removing ${file}:`, err);
          }
        }
      }
      
      // Clean up any device-specific blocking scripts
      const tmpFiles = await fs.readdir('/tmp');
      for (const file of tmpFiles) {
        if (file.startsWith('usb_block_') && file.endsWith('.sh')) {
          await fs.unlink(path.join('/tmp', file));
        }
      }
    } catch (err) {
      console.error('Error during cleanup:', err);
    }
  }
}

module.exports = new DeviceManager();
