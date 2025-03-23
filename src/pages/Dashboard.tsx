import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Shield, List, Plus, Database, Check, X, Filter, Ban, Settings, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { fetchUSBDevices, monitorUSBPorts, addDeviceToWhitelist, removeDeviceFromWhitelist, fetchAllowedDeviceClasses, updateAllowedDeviceClasses } from "@/lib/usb-service";
const Dashboard = () => {
  const {
    toast
  } = useToast();
  const [showWhitelistDevices, setShowWhitelistDevices] = useState(false);
  const [showBlockedAttempts, setShowBlockedAttempts] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [showClassSettingsModal, setShowClassSettingsModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [usernameFilter, setUsernameFilter] = useState("");
  const [whitelistedDevices, setWhitelistedDevices] = useState([]);
  const [blockedAttempts, setBlockedAttempts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [allowedClasses, setAllowedClasses] = useState([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [newDevice, setNewDevice] = useState({
    productId: "",
    vendorId: "",
    manufacturer: "",
    username: ""
  });
  const deviceClassesList = [{
    id: "00",
    name: "Device",
    description: "Unspecified device"
  }, {
    id: "01",
    name: "Audio",
    description: "Audio devices"
  }, {
    id: "02",
    name: "CDC Control",
    description: "Communication devices"
  }, {
    id: "03",
    name: "HID (Human Interface Device)",
    description: "Keyboards, mice, etc."
  }, {
    id: "05",
    name: "Physical",
    description: "Physical devices"
  }, {
    id: "06",
    name: "Image",
    description: "Still imaging devices"
  }, {
    id: "07",
    name: "Printer",
    description: "Printers"
  }, {
    id: "08",
    name: "Mass Storage",
    description: "Mass storage devices"
  }, {
    id: "09",
    name: "Hub",
    description: "USB hubs"
  }, {
    id: "0A",
    name: "CDC Data",
    description: "CDC data devices"
  }, {
    id: "0B",
    name: "Smart Card",
    description: "Smart card devices"
  }, {
    id: "0D",
    name: "Content Security",
    description: "Content security devices"
  }, {
    id: "0E",
    name: "Video",
    description: "Video devices (webcams)"
  }, {
    id: "0F",
    name: "Personal Healthcare",
    description: "Healthcare devices"
  }, {
    id: "10",
    name: "Audio/Video",
    description: "Audio-video devices"
  }, {
    id: "DC",
    name: "Diagnostic",
    description: "Diagnostic devices"
  }, {
    id: "E0",
    name: "Wireless Controller",
    description: "Wireless controllers"
  }, {
    id: "EF",
    name: "Miscellaneous",
    description: "Miscellaneous devices"
  }, {
    id: "FE",
    name: "Application Specific",
    description: "Application specific devices"
  }, {
    id: "FF",
    name: "Vendor Specific",
    description: "Vendor specific devices"
  }];
  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await fetchUSBDevices();
        setWhitelistedDevices(data.whitelistedDevices || []);
        setBlockedAttempts(data.blockedAttempts || []);
        setLogs(data.logs || []);
        setAllowedClasses(data.allowedClasses || []);
        setLastUpdated(new Date());
      } catch (error) {
        console.error("Error fetching USB devices:", error);
        toast({
          title: "Error",
          description: "Failed to fetch USB devices data. Make sure the backend server is running.",
          variant: "destructive"
        });
      }
    };
    fetchData();
  }, [toast]);
  useEffect(() => {
    let monitoringSubscription;
    const startMonitoring = async () => {
      try {
        setIsMonitoring(true);
        monitoringSubscription = await monitorUSBPorts(newData => {
          if (newData.newLog) {
            setLogs(prev => [newData.newLog, ...prev]);
          }
          if (newData.newBlockedAttempt) {
            setBlockedAttempts(prev => [newData.newBlockedAttempt, ...prev]);
          }
          if (newData.whitelistUpdate) {
            setWhitelistedDevices(newData.whitelistUpdate);
          }
          if (newData.allowedClassesUpdate) {
            setAllowedClasses(newData.allowedClassesUpdate);
          }
          setLastUpdated(new Date());
          if (newData.newBlockedAttempt) {
            toast({
              title: "USB Access Blocked",
              description: `${newData.newBlockedAttempt.manufacturer || "Unknown device"} was blocked from accessing the system`,
              variant: "destructive"
            });
          }
        });
      } catch (error) {
        console.error("Error monitoring USB ports:", error);
        setIsMonitoring(false);
        toast({
          title: "Monitoring Error",
          description: "Failed to start USB port monitoring",
          variant: "destructive"
        });
      }
    };
    startMonitoring();
    return () => {
      if (monitoringSubscription) {
        monitoringSubscription.unsubscribe();
      }
      setIsMonitoring(false);
    };
  }, [toast]);
  const handleInputChange = e => {
    const {
      name,
      value
    } = e.target;
    setNewDevice(prev => ({
      ...prev,
      [name]: value
    }));
  };
  const handleAddDevice = async () => {
    try {
      await addDeviceToWhitelist(newDevice);
      setWhitelistedDevices(prev => [...prev, {
        id: Date.now(),
        ...newDevice,
        status: "allowed"
      }]);
      toast({
        title: "Success!",
        description: "Device added to whitelist successfully",
        variant: "default"
      });
      setShowAddDeviceModal(false);
      setNewDevice({
        productId: "",
        vendorId: "",
        manufacturer: "",
        username: ""
      });
    } catch (error) {
      console.error("Error adding device to whitelist:", error);
      toast({
        title: "Error",
        description: "Failed to add device to whitelist",
        variant: "destructive"
      });
    }
  };
  const handleAddToWhitelist = async device => {
    try {
      await addDeviceToWhitelist(device);
      setWhitelistedDevices(prev => [...prev, {
        ...device,
        status: "allowed"
      }]);
      setBlockedAttempts(prev => prev.filter(item => !(item.productId === device.productId && item.vendorId === device.vendorId)));
      toast({
        title: "Success!",
        description: "Device added to whitelist successfully",
        variant: "default"
      });
    } catch (error) {
      console.error("Error adding device to whitelist:", error);
      toast({
        title: "Error",
        description: "Failed to add device to whitelist",
        variant: "destructive"
      });
    }
  };
  const handleBlockDevice = async deviceId => {
    try {
      await removeDeviceFromWhitelist(deviceId);
      setWhitelistedDevices(prev => prev.filter(device => device.id !== deviceId));
      toast({
        title: "Success!",
        description: "Device removed from whitelist and blocked successfully",
        variant: "default"
      });
    } catch (error) {
      console.error("Error removing device from whitelist:", error);
      toast({
        title: "Error",
        description: "Failed to remove device from whitelist",
        variant: "destructive"
      });
    }
  };
  const handleToggleDeviceClass = async classId => {
    try {
      const isAllowed = allowedClasses.some(c => c.id === classId);
      let updatedClasses;
      if (isAllowed) {
        updatedClasses = allowedClasses.filter(c => c.id !== classId);
      } else {
        const classToAdd = deviceClassesList.find(c => c.id === classId);
        if (classToAdd) {
          updatedClasses = [...allowedClasses, classToAdd];
        } else {
          updatedClasses = [...allowedClasses];
        }
      }
      await updateAllowedDeviceClasses(updatedClasses);
      setAllowedClasses(updatedClasses);
      toast({
        title: "Success!",
        description: `Device class ${isAllowed ? 'blocked' : 'allowed'} successfully`,
        variant: "default"
      });
    } catch (error) {
      console.error("Error updating allowed device classes:", error);
      toast({
        title: "Error",
        description: "Failed to update allowed device classes",
        variant: "destructive"
      });
    }
  };
  const stats = [{
    title: "Total USB Events",
    value: logs.length.toString(),
    icon: Database,
    change: logs.length > 0 ? `Last: ${new Date(logs[0]?.date).toLocaleTimeString()}` : "No events",
    changeType: "neutral"
  }, {
    title: "Blocked Attempts",
    value: blockedAttempts.length.toString(),
    icon: Shield,
    change: blockedAttempts.length > 0 ? `Last: ${new Date(blockedAttempts[0]?.date).toLocaleTimeString()}` : "No blocks",
    changeType: "negative"
  }, {
    title: "Whitelisted Devices",
    value: whitelistedDevices.length.toString(),
    icon: List,
    change: `${whitelistedDevices.length} devices`,
    changeType: "positive"
  }];
  const filteredLogs = logs.filter(log => {
    if (statusFilter !== "all" && log.status !== statusFilter) {
      return false;
    }
    if (usernameFilter && !log.username.toLowerCase().includes(usernameFilter.toLowerCase())) {
      return false;
    }
    return true;
  });
  const getDeviceClassInfo = classId => {
    if (!classId) return "Unknown";
    const classInfo = deviceClassesList.find(c => c.id.toLowerCase() === classId.toLowerCase());
    return classInfo ? classInfo.name : classId;
  };
  return <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isMonitoring ? "USB Ports Monitoring Active" : "Monitoring Inactive"} | Last Updated: {lastUpdated.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowClassSettingsModal(true)} className="inline-flex items-center px-4 py-2 bg-secondary rounded-lg hover:bg-secondary/90 transition-colors text-slate-950">
            <Settings className="w-5 h-5 mr-2" />
            Device Classes
          </Button>
          <Button onClick={() => setShowAddDeviceModal(true)} className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
            <Plus className="w-5 h-5 mr-2" />
            Add Device
          </Button>
        </div>
      </div>

      

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {stats.map(stat => <div key={stat.title} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:border-primary/20 transition-all duration-200 cursor-pointer" onClick={() => {
        if (stat.title === "Whitelisted Devices") {
          setShowWhitelistDevices(true);
          setShowBlockedAttempts(false);
          setShowLogs(false);
        } else if (stat.title === "Blocked Attempts") {
          setShowBlockedAttempts(true);
          setShowWhitelistDevices(false);
          setShowLogs(false);
        } else if (stat.title === "Total USB Events") {
          setShowLogs(true);
          setShowWhitelistDevices(false);
          setShowBlockedAttempts(false);
        }
      }}>
            <div className="flex items-center justify-between">
              <stat.icon className="w-8 h-8 text-primary" />
              <span className={`text-sm font-medium ${stat.changeType === "positive" ? "text-green-600" : stat.changeType === "negative" ? "text-red-600" : "text-gray-600"}`}>
                {stat.change}
              </span>
            </div>
            <p className="mt-4 text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-sm text-gray-600">{stat.title}</p>
          </div>)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4">Recent Events</h2>
          {showWhitelistDevices && <div>
              <h3 className="text-md font-medium mb-2">Whitelisted Devices</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product ID</TableHead>
                      <TableHead>Vendor ID</TableHead>
                      <TableHead>Manufacturer</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {whitelistedDevices.length > 0 ? whitelistedDevices.map(device => <TableRow key={device.id}>
                          <TableCell>{device.productId}</TableCell>
                          <TableCell>{device.vendorId}</TableCell>
                          <TableCell>{device.manufacturer}</TableCell>
                          <TableCell>{device.username}</TableCell>
                          <TableCell>{getDeviceClassInfo(device.deviceClass)}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <Check className="w-3 h-3 mr-1" />
                              {device.status}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="destructive" onClick={() => handleBlockDevice(device.id)} className="flex items-center gap-1">
                              <Ban className="w-3 h-3" />
                              Block
                            </Button>
                          </TableCell>
                        </TableRow>) : <TableRow>
                        <TableCell colSpan={7} className="text-center py-4 text-gray-500">
                          No whitelisted devices found
                        </TableCell>
                      </TableRow>}
                  </TableBody>
                </Table>
              </div>
            </div>}
          
          {showBlockedAttempts && <div>
              <h3 className="text-md font-medium mb-2">Blocked Attempts</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Product ID</TableHead>
                      <TableHead>Vendor ID</TableHead>
                      <TableHead>Manufacturer</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockedAttempts.length > 0 ? blockedAttempts.map(device => <TableRow key={device.id}>
                          <TableCell>{new Date(device.date).toLocaleDateString()}</TableCell>
                          <TableCell>{new Date(device.date).toLocaleTimeString()}</TableCell>
                          <TableCell>{device.productId}</TableCell>
                          <TableCell>{device.vendorId}</TableCell>
                          <TableCell>{device.manufacturer}</TableCell>
                          <TableCell>{getDeviceClassInfo(device.deviceClass)}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <X className="w-3 h-3 mr-1" />
                              {device.status}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => handleAddToWhitelist(device)}>
                              Add to Whitelist
                            </Button>
                          </TableCell>
                        </TableRow>) : <TableRow>
                        <TableCell colSpan={8} className="text-center py-4 text-gray-500">
                          No blocked attempts found
                        </TableCell>
                      </TableRow>}
                  </TableBody>
                </Table>
              </div>
            </div>}
          
          {showLogs && <div>
              <h3 className="text-md font-medium mb-2">All USB Events</h3>
              
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium">Filter by:</span>
                </div>
                <div className="flex flex-1 flex-col sm:flex-row gap-4">
                  <div className="w-full sm:w-1/3">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="allowed">Allowed</SelectItem>
                        <SelectItem value="blocked">Blocked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-full sm:w-2/3">
                    <Input placeholder="Filter by username" value={usernameFilter} onChange={e => setUsernameFilter(e.target.value)} className="w-full" />
                  </div>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Product ID</TableHead>
                      <TableHead>Vendor ID</TableHead>
                      <TableHead>Manufacturer</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.length > 0 ? filteredLogs.map(log => <TableRow key={log.id}>
                          <TableCell>{new Date(log.date).toLocaleDateString()}</TableCell>
                          <TableCell>{new Date(log.date).toLocaleTimeString()}</TableCell>
                          <TableCell>{log.productId}</TableCell>
                          <TableCell>{log.vendorId}</TableCell>
                          <TableCell>{log.manufacturer}</TableCell>
                          <TableCell>{getDeviceClassInfo(log.deviceClass)}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${log.status === "allowed" ? "bg-green-100 text-green-800" : log.status === "blocked" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"}`}>
                              {log.status === "allowed" ? <Check className="w-3 h-3 mr-1" /> : log.status === "blocked" ? <X className="w-3 h-3 mr-1" /> : null}
                              {log.status}
                            </span>
                          </TableCell>
                          <TableCell>{log.action}</TableCell>
                        </TableRow>) : <TableRow>
                        <TableCell colSpan={8} className="text-center py-4 text-gray-500">
                          No logs found matching your filters
                        </TableCell>
                      </TableRow>}
                  </TableBody>
                </Table>
              </div>
            </div>}
          
          {!showWhitelistDevices && !showBlockedAttempts && !showLogs && <p className="text-gray-500 italic">Click on one of the stats cards above to view details</p>}
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-4">
            <div onClick={() => {
            setShowLogs(true);
            setShowWhitelistDevices(false);
            setShowBlockedAttempts(false);
          }} className="flex items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
              <Database className="w-6 h-6 text-primary mr-3" />
              <div>
                <h3 className="font-medium">View Logs</h3>
                <p className="text-sm text-gray-600">Check USB device activity</p>
              </div>
            </div>
            <div onClick={() => {
            setShowWhitelistDevices(true);
            setShowLogs(false);
            setShowBlockedAttempts(false);
          }} className="flex items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
              <List className="w-6 h-6 text-primary mr-3" />
              <div>
                <h3 className="font-medium">Manage Whitelist</h3>
                <p className="text-sm text-gray-600">Add or remove USB devices</p>
              </div>
            </div>
            <div onClick={() => setShowClassSettingsModal(true)} className="flex items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
              <Settings className="w-6 h-6 text-primary mr-3" />
              <div>
                <h3 className="font-medium">Device Class Settings</h3>
                <p className="text-sm text-gray-600">Configure allowed USB device classes</p>
              </div>
            </div>
            <div className="mt-6">
              <h3 className="text-sm font-medium mb-2">Monitoring Status</h3>
              <div className={`p-3 rounded-md ${isMonitoring ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {isMonitoring ? <div className="flex items-center">
                    <div className="relative mr-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <div className="w-3 h-3 bg-green-500 rounded-full absolute top-0 animate-ping"></div>
                    </div>
                    <span>USB Monitoring Active</span>
                  </div> : <div className="flex items-center">
                    <div className="w-3 h-3 bg-red-500 rounded-full mr-3"></div>
                    <span>Monitoring Inactive</span>
                  </div>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showAddDeviceModal} onOpenChange={setShowAddDeviceModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Device to Whitelist</DialogTitle>
            <DialogDescription>
              Enter the details of the USB device you want to add to the whitelist.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="productId" className="text-right">
                Product ID
              </label>
              <input id="productId" name="productId" value={newDevice.productId} onChange={handleInputChange} className="col-span-3 px-3 py-2 border rounded-md" placeholder="0x1234" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="vendorId" className="text-right">
                Vendor ID
              </label>
              <input id="vendorId" name="vendorId" value={newDevice.vendorId} onChange={handleInputChange} className="col-span-3 px-3 py-2 border rounded-md" placeholder="0x5678" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="manufacturer" className="text-right">
                Manufacturer
              </label>
              <input id="manufacturer" name="manufacturer" value={newDevice.manufacturer} onChange={handleInputChange} className="col-span-3 px-3 py-2 border rounded-md" placeholder="Kingston" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="username" className="text-right">
                Username
              </label>
              <input id="username" name="username" value={newDevice.username} onChange={handleInputChange} className="col-span-3 px-3 py-2 border rounded-md" placeholder="john.doe" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDeviceModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddDevice}>Add Device</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showClassSettingsModal} onOpenChange={setShowClassSettingsModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Configure Device Class Settings</DialogTitle>
            <DialogDescription>
              Select which USB device classes should be allowed on your system.
              Human interface devices like keyboards and mice, webcams, and audio devices are recommended to be allowed.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {deviceClassesList.map(deviceClass => {
              const isAllowed = allowedClasses.some(c => c.id === deviceClass.id);
              return <div key={deviceClass.id} className={`p-4 border rounded-lg ${isAllowed ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
                    <div className="flex items-center space-x-2">
                      <Checkbox id={`class-${deviceClass.id}`} checked={isAllowed} onCheckedChange={() => handleToggleDeviceClass(deviceClass.id)} />
                      <label htmlFor={`class-${deviceClass.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        {deviceClass.name} (Class {deviceClass.id})
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 ml-6">{deviceClass.description}</p>
                  </div>;
            })}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowClassSettingsModal(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>;
};
export default Dashboard;