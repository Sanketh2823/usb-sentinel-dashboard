
const os = require('os');
const { exec } = require('child_process');

// New function to check for admin/system privileges
const checkSystemPrivileges = () => {
  return new Promise((resolve) => {
    const platform = os.platform();
    let checkCommand;
    
    if (platform === 'darwin') {
      // Check for admin access on macOS
      checkCommand = 'sudo -n true 2>/dev/null';
    } else if (platform === 'win32') {
      // Check for admin access on Windows
      checkCommand = 'net session >nul 2>&1';
    } else {
      // Check for sudo access on Linux
      checkCommand = 'sudo -n true 2>/dev/null';
    }
    
    exec(checkCommand, (error) => {
      // If there's an error, we don't have admin privileges
      resolve(!error);
    });
  });
};

// Helper function to get permission instructions based on platform
const getPermissionInstructions = () => {
  const platform = os.platform();
  
  if (platform === 'darwin') {
    return {
      platform: 'macOS',
      instructions: [
        'Open Terminal and run the following command:',
        'sudo /path/to/your/app',
        'Alternatively, you can run this command to grant permissions:',
        'sudo chmod +s /path/to/your/app',
        'For USB power management, you may need to grant Full Disk Access to Terminal in System Preferences > Security & Privacy > Privacy'
      ]
    };
  } else if (platform === 'win32') {
    return {
      platform: 'Windows',
      instructions: [
        'Right-click on the application and select "Run as administrator"',
        'Or, you can create a shortcut to the app, right-click the shortcut, select Properties, click Advanced, and check "Run as administrator"',
        'You may also need to run Command Prompt as administrator and start the application from there'
      ]
    };
  } else {
    return {
      platform: 'Linux',
      instructions: [
        'Run the application with sudo:',
        'sudo /path/to/your/app',
        'Alternatively, you can create a udev rule to allow non-root users to manage USB devices:',
        'Create a file at /etc/udev/rules.d/99-usb-permissions.rules',
        'Add: SUBSYSTEM=="usb", MODE="0666"',
        'Then run: sudo udevadm control --reload-rules && sudo udevadm trigger'
      ]
    };
  }
};

// Helper function to promisify exec
const execPromise = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

module.exports = {
  checkSystemPrivileges,
  getPermissionInstructions,
  execPromise
};
