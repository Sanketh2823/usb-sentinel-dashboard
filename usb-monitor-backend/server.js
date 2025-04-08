
const express = require('express');
const cors = require('cors');
const http = require('http');
const usbDetect = require("usb-detection");
const os = require('os');
const { execSync } = require('child_process');

// Import modules
const { initializeDataFiles } = require('./src/config');
const { router, setBroadcastWss, broadcastUpdate } = require('./src/routes');
const setupWebSocket = require('./src/websocket');
const setupUsbMonitor = require('./src/usb-monitor');
const { checkSystemPrivileges } = require('./src/utils/system');

const app = express();
const DEFAULT_PORT = 3001;
const MAX_PORT_ATTEMPTS = 10;
let port = process.env.PORT || DEFAULT_PORT;

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

// Helper function to check if port is in use
const isPortInUse = (port) => {
  try {
    // Try different approaches based on platform
    if (os.platform() === 'win32') {
      // Windows approach
      const result = execSync(`netstat -ano | findstr :${port}`).toString();
      return result.length > 0;
    } else {
      // Unix-like approach (macOS, Linux)
      const result = execSync(`lsof -i :${port}`).toString();
      return result.length > 0;
    }
  } catch (error) {
    // If command fails, likely port is not in use
    return false;
  }
};

// Error handling for server startup
const startServer = () => {
  // Check if port is already in use before trying to listen
  if (isPortInUse(port)) {
    console.log(`Port ${port} is already in use. Trying alternative port.`);
    port++;
    
    // If we've tried too many ports, give up
    if (port >= DEFAULT_PORT + MAX_PORT_ATTEMPTS) {
      console.error(`Failed to find an available port after ${MAX_PORT_ATTEMPTS} attempts.`);
      console.error(`Please manually specify a port with the PORT environment variable.`);
      process.exit(1);
    }
    
    // Try the next port
    return startServer();
  }

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
  
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log(`Port ${port} is busy, attempting to use alternative port ${port + 1}`);
      server.close();
      // Try the next port
      port++;
      
      // If we've tried too many ports, give up
      if (port >= DEFAULT_PORT + MAX_PORT_ATTEMPTS) {
        console.error(`Failed to find an available port after ${MAX_PORT_ATTEMPTS} attempts.`);
        console.error(`Please manually specify a port with the PORT environment variable.`);
        process.exit(1);
      }
      
      startServer();
    } else {
      console.error('Server error:', e);
      process.exit(1);
    }
  });
};

// Start the server
startServer();
