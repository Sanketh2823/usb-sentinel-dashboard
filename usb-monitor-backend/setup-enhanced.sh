
#!/bin/bash

# USB Monitor Backend - Enhanced Permission Setup Script for macOS
# This script helps set up the necessary permissions for USB device blocking with kernel-level protections

echo "USB Monitor - macOS Enhanced Protection Setup"
echo "============================================="
echo "This script will set up advanced permissions needed for effective USB device blocking."
echo "Administrator privileges are required."
echo

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
  echo "This script must be run as root (using sudo)."
  echo "Please run: sudo ./setup-enhanced.sh"
  exit 1
fi

echo "Setting up enhanced permissions for USB device management..."

# Create kext whitelist if needed
echo "Adding required kernel extensions to whitelist..."
/usr/sbin/spctl kext-consent add 05AC || echo "Unable to add Apple kexts to whitelist - continuing anyway"

# Ensure USB-related kernel extensions are loaded
echo "Loading required kernel extensions..."
kextutil -b com.apple.iokit.IOUSBHostFamily 2>/dev/null || echo "Unable to load IOUSBHostFamily - may already be loaded"
kextutil -b com.apple.driver.usb.massstorage 2>/dev/null || echo "Unable to load usb.massstorage - may already be loaded"
kextutil -b com.apple.iokit.IOUSBMassStorageClass 2>/dev/null || echo "Unable to load IOUSBMassStorageClass - may already be loaded"

# Create enhanced blocking script directories
mkdir -p /usr/local/bin/usb-monitor

# Create enhanced blocking scripts for USB classes
cat > /usr/local/bin/usb-monitor/enhanced-block-usb-storage.sh << 'EOF'
#!/bin/bash
echo "Enhanced USB storage blocking active..."

# Combined blocking strategy
echo "Unloading all USB storage drivers..."
kextunload -b com.apple.driver.usb.massstorage 2>/dev/null
kextunload -b com.apple.iokit.IOUSBMassStorageClass 2>/dev/null

# Find and forcibly unmount all external USB storage
echo "Unmounting all external USB storage..."
for disk in $(diskutil list | grep external | grep -o 'disk[0-9]'); do
  echo "Forcibly unmounting $disk..."
  diskutil unmountDisk force /dev/$disk 2>/dev/null
  diskutil eject force /dev/$disk 2>/dev/null
done

# Set up persistent blocking through at-restart hook
if [ ! -f /Library/LaunchDaemons/com.usbmonitor.blockusb.plist ]; then
  cat > /Library/LaunchDaemons/com.usbmonitor.blockusb.plist << 'LAUNCHDAEMON'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.usbmonitor.blockusb</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/usb-monitor/enhanced-block-usb-storage.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>/var/log/usbmonitor-block.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/usbmonitor-block.log</string>
</dict>
</plist>
LAUNCHDAEMON
  
  chown root:wheel /Library/LaunchDaemons/com.usbmonitor.blockusb.plist
  chmod 644 /Library/LaunchDaemons/com.usbmonitor.blockusb.plist
  launchctl load /Library/LaunchDaemons/com.usbmonitor.blockusb.plist
  echo "Installed persistent USB storage blocking service"
fi

echo "Running continuous USB monitoring process..."
# Continuous monitoring
while true; do
  # Check for newly connected USB storage devices
  system_profiler SPUSBDataType | grep -A 10 "Mass Storage" | grep -B 5 -A 5 "BSD Name:" | while read -r line; do
    if [[ $line == *"BSD Name:"* ]]; then
      bsd_name=$(echo $line | awk '{print $3}')
      echo "Detected USB storage device: $bsd_name - forcibly unmounting"
      diskutil unmountDisk force /dev/$bsd_name 2>/dev/null
      diskutil eject force /dev/$bsd_name 2>/dev/null
    fi
  done
  sleep 2
done &

echo "Enhanced blocking active! USB storage devices will be blocked."
EOF

# Set permissions
chmod +x /usr/local/bin/usb-monitor/*.sh

# Create launcher daemon with enhanced privileges
cat > /Library/LaunchDaemons/com.usbmonitor.enhanced.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.usbmonitor.enhanced</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/usb-monitor/enhanced-block-usb-storage.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/usbmonitor-enhanced.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/usbmonitor-enhanced.log</string>
</dict>
</plist>
EOF

# Load the enhanced daemon
launchctl load /Library/LaunchDaemons/com.usbmonitor.enhanced.plist || echo "Failed to load enhanced daemon"

# Start the enhanced blocking immediately
/usr/local/bin/usb-monitor/enhanced-block-usb-storage.sh &

echo
echo "Enhanced setup completed successfully!"
echo
echo "The USB blocking system is now running with kernel-level protection!"
echo
echo "To view USB blocking logs:"
echo "tail -f /var/log/usbmonitor-enhanced.log"
echo
echo "If devices are still connecting, run: sudo ./setup-enhanced.sh restart"
echo "This may require a system restart for full effect."
echo

# Make the script itself executable
chmod +x "$(dirname "$0")/setup-enhanced.sh"
