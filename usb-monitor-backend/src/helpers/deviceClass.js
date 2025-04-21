
/**
 * Helper functions for USB device class operations.
 */
const HID_CLASS_ID = "03";

/**
 * Returns true if a device class corresponds to a mouse/HID type.
 * Accepts both hex string and integer input.
 */
function isMouseClass(deviceClass) {
  if (!deviceClass) return false;
  return deviceClass === HID_CLASS_ID || deviceClass === parseInt(HID_CLASS_ID, 16);
}

/**
 * Returns true if a device should be blocked:
 * Only allow HID class (mouse/keyboards) or whitelisted by vendorId/productId.
 * @param {object} device
 * @param {string} deviceClass (hex string, e.g., "08")
 * @param {Array} whitelistedDevices
 * @returns {boolean}
 */
function shouldBlockDevice(device, deviceClass, whitelistedDevices) {
  if (isMouseClass(deviceClass)) return false;
  return !whitelistedDevices.some(
    (d) =>
      d.vendorId.toLowerCase() === device.vendorId.toString(16).padStart(4, "0").toLowerCase() &&
      d.productId.toLowerCase() === device.productId.toString(16).padStart(4, "0").toLowerCase()
  );
}

module.exports = { isMouseClass, shouldBlockDevice };
