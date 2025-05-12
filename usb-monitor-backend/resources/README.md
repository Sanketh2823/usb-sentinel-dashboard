
# USB Monitor Resources

This directory contains resources needed for USB Monitor to work with different platforms.

## Windows

### Devcon.exe

To enable USB device blocking on Windows, you need to place the `devcon.exe` utility in this directory.

#### How to obtain Devcon:

1. **From Windows Driver Kit (WDK)**:
   - Download the Windows Driver Kit from Microsoft: https://docs.microsoft.com/en-us/windows-hardware/drivers/download-the-wdk
   - After installation, find devcon.exe in the WDK installation directory (typically under `C:\Program Files (x86)\Windows Kits\10\Tools\x64\devcon.exe`)
   - Copy devcon.exe to this resources directory

2. **Alternative - Download prebuilt version**:
   - You can find prebuilt versions of devcon online, but make sure to obtain it from a trusted source
   - Place the downloaded devcon.exe in this resources directory

3. **Automatic Setup**:
   - Run the included `setup-permissions.sh` script with administrator privileges on Windows
   - This will attempt to locate or download devcon.exe automatically

## Linux

Linux uses standard tools that are installed via the setup script:

1. **Required packages**:
   - udev: For device management and rules
   - usbutils: For USB device information (lsusb command)

2. **Setup**:
   - Run `sudo ./setup-permissions-linux.sh` to install dependencies and set up udev rules
   - This grants the necessary permissions for USB device management

## macOS

macOS uses built-in system utilities that are configured by the setup script:

1. **Setup**:
   - Run `sudo ./setup-permissions.sh` on macOS to configure permissions
   - For enhanced blocking, run `sudo ./setup-enhanced.sh`

## Cross-Platform Compatibility

The USB Monitor works across all three platforms:

1. **Windows**: Uses Devcon.exe and PowerShell for device management
2. **macOS**: Uses built-in IOKit and system utilities
3. **Linux**: Uses udev rules and USB authorization

Each platform implements the same core functionality:
- Device detection
- Whitelist/blacklist management
- Device blocking and unblocking
- Event logging

The backend automatically detects which platform it's running on and uses the appropriate implementation.
