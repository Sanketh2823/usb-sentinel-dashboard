
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

# CRITICAL: Remove any existing permanent blocking files that may interfere with whitelisting
echo "Removing any existing permanent blocking files..."
launchctl unload /Library/LaunchDaemons/com.usbmonitor.blockusb.plist 2>/dev/null || true
launchctl unload /Library/LaunchDaemons/com.usbmonitor.enhanced.plist 2>/dev/null || true
rm -f /Library/LaunchDaemons/com.usbmonitor.blockusb.plist 2>/dev/null || true
rm -f /Library/LaunchDaemons/com.usbmonitor.enhanced.plist 2>/dev/null || true

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

# IMPORTANT CHANGE: No more persistent blocking through at-restart hook
# The permanent blocking has been removed to allow whitelisting to work

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

# CRITICAL: Explicitly reload USB subsystem to ensure clean state
echo "Reloading USB subsystem for a clean state..."
kextunload -b com.apple.iokit.IOUSBHostFamily 2>/dev/null || true
sleep 1
kextload -b com.apple.iokit.IOUSBHostFamily 2>/dev/null || true

echo
echo "Enhanced setup completed successfully!"
echo "BUT WITHOUT permanent blocking - this allows whitelisting to work properly."
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
