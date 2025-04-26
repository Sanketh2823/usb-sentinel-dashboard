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
app.use(cors({
  origin: '*',  // Allow any origin for development
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

// Initialize data files
initializeDataFiles();

// Set up WebSocket server with automatic reconnection handling
const wss = setupWebSocket(server);
setBroadcastWss(wss);

// Set up USB monitoring
setupUsbMonitor(usbDetect, broadcastUpdate);

// Register routes
app.use('/api', router);

// Add a simple health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', port });
});

// Add a heartbeat route to check if server is alive
app.get('/heartbeat', (req, res) => {
  res.json({ timestamp: new Date().toISOString() });
});

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

// Get a free port starting from the given one
const getFreePort = (startPort) => {
  let currentPort = startPort;
  
  while (isPortInUse(currentPort)) {
    console.log(`Port ${currentPort} is in use, trying next port...`);
    currentPort++;
    
    if (currentPort >= startPort + MAX_PORT_ATTEMPTS) {
      console.error(`Failed to find an available port after ${MAX_PORT_ATTEMPTS} attempts.`);
      console.error(`Please manually specify a port with the PORT environment variable.`);
      process.exit(1);
    }
  }
  
  return currentPort;
};

// Modified server startup with enhanced stability
const startServer = () => {
  // Find a free port before trying to listen
  port = getFreePort(port);
  console.log(`Attempting to start server on port ${port}...`);
  
  server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log(`Current platform: ${os.platform()}`);
    
    // Print WebSocket details
    console.log(`WebSocket server running at ws://localhost:${port}`);
    
    checkSystemPrivileges().then((hasPrivileges) => {
      if (hasPrivileges) {
        console.log('Running with system privileges');
      } else {
        console.log('Running without system privileges - some functionality may be limited');
        console.log('Run with sudo/admin privileges for full functionality');
      }
    });
    
    // Set up server keep-alive mechanisms
    setInterval(() => {
      // Ping all WebSocket clients to keep connections alive
      wss.clients.forEach(client => {
        try {
          if (client.readyState === 1) { // if open
            client.ping();
            client.send(JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() }));
          }
        } catch (e) {
          console.error('WebSocket ping error:', e);
        }
      });
    }, 15000); // Every 15 seconds
  });
  
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log(`Port ${port} is busy, attempting to use alternative port ${port + 1}`);
      server.close();
      port++;
      
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

// Set up process error handling for stability
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Don't exit - try to keep the server running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit - try to keep the server running
});

// Start the server
startServer();
