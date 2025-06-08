
const path = require('path');
const fs = require('fs');

// Data storage paths
const dataDir = path.join(__dirname, '../../data');
const whitelistPath = path.join(dataDir, 'whitelist.json');
const blockedAttemptsPath = path.join(dataDir, 'blocked-attempts.json');
const logsPath = path.join(dataDir, 'logs.json');
const allowedClassesPath = path.join(dataDir, 'allowed-classes.json');

// Create data directory if it doesn't exist
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize data files if they don't exist
const initializeDataFiles = () => {
  if (!fs.existsSync(whitelistPath)) {
    fs.writeFileSync(whitelistPath, JSON.stringify([]));
  }
  
  if (!fs.existsSync(blockedAttemptsPath)) {
    fs.writeFileSync(blockedAttemptsPath, JSON.stringify([]));
  }
  
  if (!fs.existsSync(logsPath)) {
    fs.writeFileSync(logsPath, JSON.stringify([]));
  }

  if (!fs.existsSync(allowedClassesPath)) {
    // Default allowed device classes: keyboard (03), mouse (03), webcam/video (0e), audio (01)
    fs.writeFileSync(allowedClassesPath, JSON.stringify([
      { id: "03", name: "HID (Human Interface Device)", description: "Keyboards, mice, etc." },
      { id: "01", name: "Audio", description: "Audio devices" },
      { id: "0e", name: "Video", description: "Webcams" }
    ]));
  }
};

// Helper functions for data operations
const readDataFile = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return [];
  }
};

const writeDataFile = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
    return false;
  }
};

module.exports = {
  dataDir,
  whitelistPath,
  blockedAttemptsPath,
  logsPath,
  allowedClassesPath,
  initializeDataFiles,
  readDataFile,
  writeDataFile
};
