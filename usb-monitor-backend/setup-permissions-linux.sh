
#!/bin/bash

# USB Monitor Backend - Permission Setup Script for Linux
# This script helps set up the necessary permissions for USB device blocking

echo "USB Monitor - Linux Permission Setup"
echo "==================================="
echo "This script will set up permissions needed for effective USB device blocking."
echo "Administrator privileges are required."
echo

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
  echo "This script must be run as root (using sudo)."
  echo "Please run: sudo ./setup-permissions-linux.sh"
  exit 1
fi

echo "Setting up permissions for USB device management..."

# Create udev rules for USB device control
echo "Creating udev rules for USB device control..."
cat > /etc/udev/rules.d/99-usb-control.rules << 'EOF'
# USB Monitor - Custom Rules for USB device access
# Allow or block specific USB device classes

# Mass Storage Devices (Class 08)
ACTION=="add", SUBSYSTEM=="usb", ATTR{bDeviceClass}=="08", RUN+="/bin/sh -c 'echo 0 > /sys$DEVPATH/authorized'"

# Printer Devices (Class 07)
ACTION=="add", SUBSYSTEM=="usb", ATTR{bDeviceClass}=="07", RUN+="/bin/sh -c 'echo 0 > /sys$DEVPATH/authorized'"

# Communication Devices (Class 02)
ACTION=="add", SUBSYSTEM=="usb", ATTR{bDeviceClass}=="02", RUN+="/bin/sh -c 'echo 0 > /sys$DEVPATH/authorized'"

# Allow access to our application
SUBSYSTEM=="usb", GROUP="plugdev", MODE="0660"
EOF

# Create helper scripts
echo "Creating helper scripts for USB class control..."

# Create script directory
mkdir -p /usr/local/bin/usb-monitor

# Script for blocking mass storage devices
cat > /usr/local/bin/usb-monitor/block-usb-storage.sh << 'EOF'
#!/bin/bash
echo "Blocking USB mass storage devices..."
for device in /sys/bus/usb/devices/*/bDeviceClass; do
  if [ -f "$device" ] && [ "$(cat $device)" = "08" ]; then
    echo 0 > "$(dirname $device)/authorized"
    echo "Blocked device: $(dirname $device)"
  fi
done
echo "Done."
EOF

# Script for blocking printer devices
cat > /usr/local/bin/usb-monitor/block-usb-printers.sh << 'EOF'
#!/bin/bash
echo "Blocking USB printer devices..."
for device in /sys/bus/usb/devices/*/bDeviceClass; do
  if [ -f "$device" ] && [ "$(cat $device)" = "07" ]; then
    echo 0 > "$(dirname $device)/authorized"
    echo "Blocked device: $(dirname $device)"
  fi
done
echo "Done."
EOF

# Script for blocking communication devices
cat > /usr/local/bin/usb-monitor/block-usb-communications.sh << 'EOF'
#!/bin/bash
echo "Blocking USB communication devices..."
for device in /sys/bus/usb/devices/*/bDeviceClass; do
  if [ -f "$device" ] && [ "$(cat $device)" = "02" ]; then
    echo 0 > "$(dirname $device)/authorized"
    echo "Blocked device: $(dirname $device)"
  fi
done
echo "Done."
EOF

# Set permissions
chmod +x /usr/local/bin/usb-monitor/*.sh

# Create systemd service
cat > /etc/systemd/system/usb-monitor.service << 'EOF'
[Unit]
Description=USB Monitor Service
After=network.target

[Service]
ExecStart=/usr/bin/node /path/to/your/usb-monitor-backend/server.js
WorkingDirectory=/path/to/your/usb-monitor-backend
Restart=always
User=root
Group=root
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Reload udev rules
echo "Reloading udev rules..."
udevadm control --reload-rules
udevadm trigger

echo
echo "Setup completed successfully!"
echo
echo "To enable the USB monitor service to run with system privileges:"
echo "1. Edit /etc/systemd/system/usb-monitor.service"
echo "2. Update the ExecStart and WorkingDirectory paths with the full path to your server.js"
echo "3. Enable and start the service with:"
echo "   sudo systemctl enable usb-monitor.service"
echo "   sudo systemctl start usb-monitor.service"
echo
echo "Note: You may need to restart your computer for some changes to take effect."
