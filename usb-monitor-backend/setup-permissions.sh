
#!/bin/bash

# USB Monitor Backend - Permission Setup Script for macOS
# This script helps set up the necessary permissions for USB device blocking

echo "USB Monitor - macOS Permission Setup"
echo "===================================="
echo "This script will set up permissions needed for effective USB device blocking."
echo "Administrator privileges are required."
echo

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
  echo "This script must be run as root (using sudo)."
  echo "Please run: sudo ./setup-permissions.sh"
  exit 1
fi

echo "Setting up permissions for USB device management..."

# Create kext whitelist if needed
echo "Adding required kernel extensions to whitelist..."
/usr/sbin/spctl kext-consent add 05AC # Apple
/usr/sbin/spctl kext-consent add 05AC # Apple USB

# Ensure USB-related kernel extensions are loaded
echo "Loading required kernel extensions..."
kextutil -b com.apple.iokit.IOUSBHostFamily || true
kextutil -b com.apple.driver.usb.massstorage || true
kextutil -b com.apple.iokit.IOUSBMassStorageClass || true

# Create unload scripts for specific USB classes
echo "Creating helper scripts for USB class control..."

# Create script directory
mkdir -p /usr/local/bin/usb-monitor

# Script for mass storage class
cat > /usr/local/bin/usb-monitor/block-usb-storage.sh << 'EOF'
#!/bin/bash
echo "Blocking USB mass storage devices..."
kextunload -b com.apple.driver.usb.massstorage
kextunload -b com.apple.iokit.IOUSBMassStorageClass
echo "Done."
EOF

# Script for printer class
cat > /usr/local/bin/usb-monitor/block-usb-printers.sh << 'EOF'
#!/bin/bash
echo "Blocking USB printer devices..."
kextunload -b com.apple.driver.AppleUSBPrinter
echo "Done."
EOF

# Script for communication devices
cat > /usr/local/bin/usb-monitor/block-usb-communications.sh << 'EOF'
#!/bin/bash
echo "Blocking USB communication devices..."
kextunload -b com.apple.driver.usb.cdc.acm
kextunload -b com.apple.driver.usb.cdc.ecm
echo "Done."
EOF

# Set permissions
chmod +x /usr/local/bin/usb-monitor/*.sh

# Create config directory
mkdir -p /etc/usb-monitor

# Create launcher daemon
cat > /Library/LaunchDaemons/com.usbmonitor.helper.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.usbmonitor.helper</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>exec /usr/local/bin/node /path/to/your/usb-monitor-backend/server.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/usbmonitor.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/usbmonitor.log</string>
</dict>
</plist>
EOF

echo
echo "Setup completed successfully!"
echo
echo "To enable the USB monitor service to run with system privileges:"
echo "1. Edit /Library/LaunchDaemons/com.usbmonitor.helper.plist"
echo "2. Update the path in the ProgramArguments section with the full path to your server.js"
echo "3. Load the service with: sudo launchctl load /Library/LaunchDaemons/com.usbmonitor.helper.plist"
echo
echo "Note: You may need to restart your computer for some changes to take effect."
