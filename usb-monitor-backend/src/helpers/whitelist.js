
/**
 * Helper to check if a USB device is whitelisted.
 * @param {object} device
 * @param {Array} whitelistedDevices
 * @returns {boolean}
 */
function isWhitelisted(device, whitelistedDevices) {
  return whitelistedDevices.some(
    (d) =>
      d.vendorId.toLowerCase() === device.vendorId.toString(16).padStart(4, "0").toLowerCase() &&
      d.productId.toLowerCase() === device.productId.toString(16).padStart(4, "0").toLowerCase()
  );
}

module.exports = { isWhitelisted };
