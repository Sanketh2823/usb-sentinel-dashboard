
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
  
  // Enhanced logging to help debug whitelist issues
  console.log(`Checking whitelist for device: ${deviceVendorId}:${deviceProductId}`);
  console.log(`Number of whitelisted devices: ${whitelistedDevices.length}`);
  
  return whitelistedDevices.some(
    (d) => {
      const whitelistedVendorId = d.vendorId.toLowerCase();
      const whitelistedProductId = d.productId.toLowerCase();
      const isMatch = whitelistedVendorId === deviceVendorId && 
                     whitelistedProductId === deviceProductId;
      
      if (isMatch) {
        console.log(`Found whitelist match: ${d.name || 'Unknown device'}`);
      }
      
      return isMatch;
    }
  );
}

/**
 * Helper to format device identifiers for consistent display and storage
 * @param {object} device 
 * @returns {object} Formatted device with consistent ID formats
 */
function formatDeviceIds(device) {
  // Ensure consistent hex format for vendorId and productId
  const formattedDevice = {...device};
  
  if (formattedDevice.vendorId) {
    // Convert number to padded lowercase hex string
    if (typeof formattedDevice.vendorId === 'number') {
      formattedDevice.vendorId = formattedDevice.vendorId.toString(16).padStart(4, "0").toLowerCase();
    } 
    // Ensure string is properly formatted
    else if (typeof formattedDevice.vendorId === 'string') {
      // Remove 0x prefix if present
      formattedDevice.vendorId = formattedDevice.vendorId.replace(/^0x/i, '').padStart(4, "0").toLowerCase();
    }
  }
  
  if (formattedDevice.productId) {
    // Convert number to padded lowercase hex string
    if (typeof formattedDevice.productId === 'number') {
      formattedDevice.productId = formattedDevice.productId.toString(16).padStart(4, "0").toLowerCase();
    } 
    // Ensure string is properly formatted
    else if (typeof formattedDevice.productId === 'string') {
      // Remove 0x prefix if present
      formattedDevice.productId = formattedDevice.productId.replace(/^0x/i, '').padStart(4, "0").toLowerCase();
    }
  }
  
  return formattedDevice;
}

module.exports = { isWhitelisted, formatDeviceIds };
