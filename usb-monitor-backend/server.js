
const express = require('express');
const cors = require('cors');
const http = require('http');
const usbDetect = require("usb-detection");
const os = require('os');

// Import modules
const { initializeDataFiles } = require('./src/config');
const { router, setBroadcastWss, broadcastUpdate } = require('./src/routes');
const setupWebSocket = require('./src/websocket');
const setupUsbMonitor = require('./src/usb-monitor');
const { checkSystemPrivileges } = require('./src/utils/system');

const app = express();
const port = 3001;

// Create HTTP server
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Initialize data files
initializeDataFiles();

// Set up WebSocket server
const wss = setupWebSocket(server);
setBroadcastWss(wss);

// Set up USB monitoring
setupUsbMonitor(usbDetect, broadcastUpdate);

// Register routes
app.use('/api', router);

// Start the server
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Current platform: ${os.platform()}`);
  
  checkSystemPrivileges().then((hasPrivileges) => {
    if (hasPrivileges) {
      console.log('Running with system privileges');
    } else {
      console.log('Running without system privileges - some functionality may be limited');
      console.log('Run with sudo/admin privileges for full functionality');
    }
  });
});
