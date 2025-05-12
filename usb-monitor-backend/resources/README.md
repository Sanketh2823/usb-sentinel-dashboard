
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

## Linux

Linux uses standard tools (udev, usbutils) that are installed via the setup script.

## macOS

macOS uses built-in system utilities that don't need additional resources.
