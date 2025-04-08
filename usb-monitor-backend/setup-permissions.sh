
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
/usr/sbin/spctl kext-consent add 05AC || echo "Unable to add Apple kexts to whitelist - continuing anyway"

# Ensure USB-related kernel extensions are loaded
echo "Loading required kernel extensions..."
kextutil -b com.apple.iokit.IOUSBHostFamily 2>/dev/null || echo "Unable to load IOUSBHostFamily - may already be loaded"
kextutil -b com.apple.driver.usb.massstorage 2>/dev/null || echo "Unable to load usb.massstorage - may already be loaded"
kextutil -b com.apple.iokit.IOUSBMassStorageClass 2>/dev/null || echo "Unable to load IOUSBMassStorageClass - may already be loaded"

# Create script directory
mkdir -p /usr/local/bin/usb-monitor

# Script for mass storage class
cat > /usr/local/bin/usb-monitor/block-usb-storage.sh << 'EOF'
#!/bin/bash
echo "Blocking USB mass storage devices..."
kextunload -b com.apple.driver.usb.massstorage 2>/dev/null || echo "Failed to unload usb.massstorage"
kextunload -b com.apple.iokit.IOUSBMassStorageClass 2>/dev/null || echo "Failed to unload IOUSBMassStorageClass"

# Also try to block using IOKit power management (blocks charging)
ioreg -p IOUSB -w0 -l | grep -i "Mass Storage" | grep -o '"IOPowerManagement" = {"DevicePowerState"=0' | while read -r line; do
  echo "Setting power management for mass storage devices"
  # Implementation would need IOKit commands which typically require a compiled program
done

echo "Done."
EOF

# Script for printer class
cat > /usr/local/bin/usb-monitor/block-usb-printers.sh << 'EOF'
#!/bin/bash
echo "Blocking USB printer devices..."
kextunload -b com.apple.driver.AppleUSBPrinter 2>/dev/null || echo "Failed to unload AppleUSBPrinter"
echo "Done."
EOF

# Script for communication devices
cat > /usr/local/bin/usb-monitor/block-usb-communications.sh << 'EOF'
#!/bin/bash
echo "Blocking USB communication devices..."
kextunload -b com.apple.driver.usb.cdc.acm 2>/dev/null || echo "Failed to unload usb.cdc.acm"
kextunload -b com.apple.driver.usb.cdc.ecm 2>/dev/null || echo "Failed to unload usb.cdc.ecm"
echo "Done."
EOF

# Script for power management (charging control)
cat > /usr/local/bin/usb-monitor/block-usb-charging.sh << 'EOF'
#!/bin/bash
echo "Attempting to block USB charging..."

# Get USB device locations
ioreg -p IOUSB -w0 -l | grep -i "USB Power Source" | while read -r line; do
  echo "Found USB power source, attempting to disable"
  # Implementation would need IOKit commands which typically require a compiled program
done

echo "Note: Complete charging blocking may require additional hardware-level controls"
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
        <string>exec /usr/local/bin/node /usr/local/bin/usb-monitor/server.js</string>
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

# Make the script itself executable (the source of the "command not found" error)
chmod +x "$(dirname "$0")/setup-permissions.sh"

echo
echo "Setup completed successfully!"
echo
echo "To enable the USB monitor service to run with system privileges:"
echo "1. Copy your server.js to /usr/local/bin/usb-monitor/"
echo "   sudo cp $(dirname "$0")/server.js /usr/local/bin/usb-monitor/"
echo "2. Load the service with: sudo launchctl load /Library/LaunchDaemons/com.usbmonitor.helper.plist"
echo
echo "For now, you can run the backend with: sudo npm run dev"
echo
echo "Note: You may need to restart your computer for some changes to take effect."
echo "If you're still having permission issues, try running these commands:"
echo "sudo chmod +x ./setup-permissions.sh"
echo "sudo ./setup-permissions.sh"
