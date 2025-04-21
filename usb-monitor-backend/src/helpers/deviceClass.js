
/**
 * Helper functions for USB device class operations.
 */
const HID_CLASS_ID = "03";
const MASS_STORAGE_CLASS_ID = "08";
const VENDOR_SPECIFIC_CLASS_ID = "ff";

/**
 * Returns true if a device class corresponds to a mouse/HID type.
 * Accepts both hex string and integer input.
 */
function isMouseClass(deviceClass) {
  if (!deviceClass) return false;
  return deviceClass === HID_CLASS_ID || deviceClass === parseInt(HID_CLASS_ID, 16);
}

/**
 * Returns true if a device class corresponds to mass storage.
 * Accepts both hex string and integer input.
 */
function isStorageClass(deviceClass) {
  if (!deviceClass) return false;
  return deviceClass === MASS_STORAGE_CLASS_ID || deviceClass === parseInt(MASS_STORAGE_CLASS_ID, 16);
}

/**
 * Checks if the device appears to be a charging-only cable
 * based on vendor ID or properties
 */
function isLikelyChargingOnly(device) {
  // Apple vendor ID for many accessories (converted to string if needed)
  const appleVendorIds = ['05ac', '1452', '05ac'];
  const vendorIdHex = device.vendorId.toString(16).padStart(4, "0").toLowerCase();
  
  // Check for Apple vendor IDs
  const isAppleDevice = appleVendorIds.includes(vendorIdHex);
  
  // Check device name for charging-related keywords if available
  const hasChargingKeywords = device.manufacturer && 
    (device.manufacturer.toLowerCase().includes('apple') || 
     device.manufacturer.toLowerCase().includes('charging'));
  
  // Likely a charging cable if it's an Apple device or has charging keywords
  return isAppleDevice || hasChargingKeywords;
}

/**
 * Returns true if a device should be blocked:
 * Allow: HID class (mouse/keyboards), charging-only cables or whitelisted by vendorId/productId.
 * Block: Mass storage devices, and any non-whitelisted device.
 * @param {object} device
 * @param {string} deviceClass (hex string, e.g., "08")
 * @param {Array} whitelistedDevices
 * @returns {boolean}
 */
function shouldBlockDevice(device, deviceClass, whitelistedDevices) {
  // Always allow HID/mouse devices
  if (isMouseClass(deviceClass)) return false;
  
  // Check if it's a charging-only cable (allow those)
  if (isLikelyChargingOnly(device)) return false;
  
  // Always block mass storage devices unless whitelisted
  const isWhitelisted = whitelistedDevices.some(
    (d) =>
      d.vendorId.toLowerCase() === device.vendorId.toString(16).padStart(4, "0").toLowerCase() &&
      d.productId.toLowerCase() === device.productId.toString(16).padStart(4, "0").toLowerCase()
  );
  
  return !isWhitelisted;
}

module.exports = { 
  isMouseClass, 
  isStorageClass, 
  isLikelyChargingOnly, 
  shouldBlockDevice 
};
