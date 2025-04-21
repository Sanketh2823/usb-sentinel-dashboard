
/**
 * Helper to check if a USB device is whitelisted.
 * @param {object} device
 * @param {Array} whitelistedDevices
 * @returns {boolean}
 */
function isWhitelisted(device, whitelistedDevices) {
  // Convert vendorId and productId to lowercase hex string for consistent comparison
  const deviceVendorId = device.vendorId.toString(16).padStart(4, "0").toLowerCase();
  const deviceProductId = device.productId.toString(16).padStart(4, "0").toLowerCase();
  
  return whitelistedDevices.some(
    (d) =>
      d.vendorId.toLowerCase() === deviceVendorId &&
      d.productId.toLowerCase() === deviceProductId
  );
}

module.exports = { isWhitelisted };
