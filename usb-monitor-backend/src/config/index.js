const fs = require('fs');

const whitelistPath = './data/whitelist.json';
const blockedAttemptsPath = './data/blockedAttempts.json';
const logsPath = './data/logs.json';
const allowedClassesPath = './data/allowedClasses.json';
const quarantinePath = './data/quarantine.json';
const auditPath = './data/audit.json';

const initializeDataFiles = () => {
  if (!fs.existsSync(whitelistPath)) {
    fs.writeFileSync(whitelistPath, JSON.stringify([], null, 2));
    console.log('Created whitelist.json file');
  }

  if (!fs.existsSync(blockedAttemptsPath)) {
    fs.writeFileSync(blockedAttemptsPath, JSON.stringify([], null, 2));
    console.log('Created blockedAttempts.json file');
  }

  if (!fs.existsSync(logsPath)) {
    fs.writeFileSync(logsPath, JSON.stringify([], null, 2));
    console.log('Created logs.json file');
  }

  if (!fs.existsSync(allowedClassesPath)) {
    fs.writeFileSync(allowedClassesPath, JSON.stringify([], null, 2));
    console.log('Created allowedClasses.json file');
  }
  
  // Initialize quarantine file
  if (!fs.existsSync(quarantinePath)) {
    fs.writeFileSync(quarantinePath, JSON.stringify([], null, 2));
    console.log('Created quarantine.json file');
  }
  
  // Initialize audit file
  if (!fs.existsSync(auditPath)) {
    fs.writeFileSync(auditPath, JSON.stringify([], null, 2));
    console.log('Created audit.json file');
  }
};

const readDataFile = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading data file ${filePath}:`, error.message);
    return [];
  }
};

const writeDataFile = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing to data file ${filePath}:`, error.message);
  }
};

module.exports = {
  initializeDataFiles,
  readDataFile,
  writeDataFile,
  whitelistPath,
  blockedAttemptsPath,
  logsPath,
  allowedClassesPath,
  quarantinePath,
  auditPath
};
