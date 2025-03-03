
// USB service for handling device data and monitoring

// Mock data for development - replace with actual API calls in production
const mockWhitelistedDevices = [
  { id: 1, productId: "0x1234", vendorId: "0x5678", manufacturer: "Kingston", username: "john.doe", status: "allowed" },
  { id: 2, productId: "0x4321", vendorId: "0x8765", manufacturer: "SanDisk", username: "jane.smith", status: "allowed" },
  { id: 3, productId: "0xabcd", vendorId: "0xefgh", manufacturer: "Seagate", username: "admin", status: "allowed" },
];

const mockBlockedAttempts = [
  { id: 1, productId: "0x9876", vendorId: "0x5432", manufacturer: "Unknown Device", username: "guest", status: "blocked", date: new Date().toISOString(), time: new Date().toLocaleTimeString() },
  { id: 2, productId: "0xfedc", vendorId: "0xba98", manufacturer: "Generic USB", username: "test.user", status: "blocked", date: new Date(Date.now() - 86400000).toISOString(), time: new Date(Date.now() - 86400000).toLocaleTimeString() },
];

const mockLogs = [
  { id: 1, productId: "0x1234", vendorId: "0x5678", manufacturer: "Kingston", username: "john.doe", status: "allowed", date: new Date().toISOString(), time: new Date().toLocaleTimeString(), action: "connected" },
  { id: 2, productId: "0x9876", vendorId: "0x5432", manufacturer: "Unknown Device", username: "guest", status: "blocked", date: new Date(Date.now() - 3600000).toISOString(), time: new Date(Date.now() - 3600000).toLocaleTimeString(), action: "blocked" },
  { id: 3, productId: "0x4321", vendorId: "0x8765", manufacturer: "SanDisk", username: "jane.smith", status: "allowed", date: new Date(Date.now() - 7200000).toISOString(), time: new Date(Date.now() - 7200000).toLocaleTimeString(), action: "disconnected" },
  { id: 4, productId: "0xfedc", vendorId: "0xba98", manufacturer: "Generic USB", username: "test.user", status: "blocked", date: new Date(Date.now() - 86400000).toISOString(), time: new Date(Date.now() - 86400000).toLocaleTimeString(), action: "blocked" },
  { id: 5, productId: "0xabcd", vendorId: "0xefgh", manufacturer: "Seagate", username: "admin", status: "allowed", date: new Date(Date.now() - 172800000).toISOString(), time: new Date(Date.now() - 172800000).toLocaleTimeString(), action: "connected" },
];

// In a real implementation, these would be API calls to your backend
export const fetchUSBDevices = async () => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  try {
    // In production, replace with actual API calls:
    // const response = await fetch('/api/usb-devices');
    // const data = await response.json();
    // return data;
    
    return {
      whitelistedDevices: mockWhitelistedDevices,
      blockedAttempts: mockBlockedAttempts,
      logs: mockLogs
    };
  } catch (error) {
    console.error("Error fetching USB devices:", error);
    throw new Error("Failed to fetch USB devices");
  }
};

export const addDeviceToWhitelist = async (device) => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 600));
  
  try {
    // In production, replace with actual API call:
    // const response = await fetch('/api/whitelist', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(device)
    // });
    // const data = await response.json();
    // return data;
    
    // Just return success for now (mock)
    return { success: true, message: "Device added to whitelist" };
  } catch (error) {
    console.error("Error adding device to whitelist:", error);
    throw new Error("Failed to add device to whitelist");
  }
};

// Simulate real-time monitoring with WebSocket-like behavior
export const monitorUSBPorts = async (callback) => {
  // In production, this would connect to a real WebSocket:
  // const socket = new WebSocket('ws://your-api-endpoint/usb-events');
  // socket.onmessage = (event) => {
  //   const data = JSON.parse(event.data);
  //   callback(data);
  // };
  // return {
  //   unsubscribe: () => socket.close()
  // };
  
  // For development, we'll simulate events at random intervals
  const manufacturers = ["Kingston", "SanDisk", "Seagate", "Transcend", "Western Digital", "Unknown Device"];
  const usernames = ["john.doe", "jane.smith", "admin", "guest", "test.user"];
  const statuses = ["allowed", "blocked"];
  const actions = ["connected", "disconnected", "blocked"];
  
  const intervalId = setInterval(() => {
    // Simulate a random USB event
    const random = Math.random();
    
    // Generate a random device
    const manufacturer = manufacturers[Math.floor(Math.random() * manufacturers.length)];
    const username = usernames[Math.floor(Math.random() * usernames.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const productId = "0x" + Math.floor(Math.random() * 65536).toString(16).padStart(4, '0');
    const vendorId = "0x" + Math.floor(Math.random() * 65536).toString(16).padStart(4, '0');
    const action = actions[Math.floor(Math.random() * actions.length)];
    const now = new Date();
    
    // Create a new log entry
    const newLog = {
      id: Date.now(),
      productId,
      vendorId,
      manufacturer,
      username,
      status,
      date: now.toISOString(),
      time: now.toLocaleTimeString(),
      action
    };
    
    // Dispatch to callback
    callback({ newLog });
    
    // Sometimes also generate a blocked attempt
    if (status === "blocked") {
      const newBlockedAttempt = {
        id: Date.now(),
        productId,
        vendorId,
        manufacturer,
        username,
        status: "blocked",
        date: now.toISOString(),
        time: now.toLocaleTimeString()
      };
      
      callback({ newBlockedAttempt });
    }
  }, 10000); // Simulate an event every 10 seconds
  
  return {
    unsubscribe: () => clearInterval(intervalId)
  };
};
