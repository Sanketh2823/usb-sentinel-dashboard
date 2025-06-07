
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Shield, Plus, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';
import { fetchUSBDevices, addDeviceToWhitelist, removeDeviceFromWhitelist } from '@/lib/usb-service';

interface WhitelistedDevice {
  id: number;
  vendorId: string;
  productId: string;
  manufacturer: string;
  description: string;
  deviceClass: string;
  name: string;
  dateAdded: string;
  addedBy: string;
}

const WhitelistManager = () => {
  const [whitelistedDevices, setWhitelistedDevices] = useState<WhitelistedDevice[]>([]);
  const [newDevice, setNewDevice] = useState({
    vendorId: '',
    productId: '',
    manufacturer: '',
    description: '',
    deviceClass: '',
    name: ''
  });
  const queryClient = useQueryClient();

  const { data: usbData, isLoading } = useQuery({
    queryKey: ['usb-devices'],
    queryFn: fetchUSBDevices,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (usbData?.whitelistedDevices) {
      setWhitelistedDevices(usbData.whitelistedDevices);
    }
  }, [usbData]);

  const addDeviceMutation = useMutation({
    mutationFn: async () => {
      return addDeviceToWhitelist({
        ...newDevice,
        username: 'Admin'
      });
    },
    onSuccess: () => {
      toast.success('Device added to whitelist');
      setNewDevice({
        vendorId: '',
        productId: '',
        manufacturer: '',
        description: '',
        deviceClass: '',
        name: ''
      });
      queryClient.invalidateQueries({ queryKey: ['usb-devices'] });
    },
    onError: (error) => {
      toast.error('Failed to add device to whitelist');
      console.error('Add device error:', error);
    }
  });

  const removeDeviceMutation = useMutation({
    mutationFn: async (deviceId: number) => {
      return removeDeviceFromWhitelist(deviceId);
    },
    onSuccess: () => {
      toast.success('Device removed from whitelist');
      queryClient.invalidateQueries({ queryKey: ['usb-devices'] });
    },
    onError: (error) => {
      toast.error('Failed to remove device from whitelist');
      console.error('Remove device error:', error);
    }
  });

  const handleAddDevice = () => {
    if (!newDevice.vendorId || !newDevice.productId || !newDevice.name) {
      toast.error('Please fill in all required fields');
      return;
    }
    addDeviceMutation.mutate();
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-32">Loading whitelist data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Add New Device Form */}
      <Card>
        <CardHeader>
          <CardTitle>Add Device to Whitelist</CardTitle>
          <CardDescription>
            Manually add a trusted USB device to the whitelist
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              placeholder="Vendor ID (e.g., 1234)"
              value={newDevice.vendorId}
              onChange={(e) => setNewDevice({ ...newDevice, vendorId: e.target.value })}
            />
            <Input
              placeholder="Product ID (e.g., 5678)"
              value={newDevice.productId}
              onChange={(e) => setNewDevice({ ...newDevice, productId: e.target.value })}
            />
            <Input
              placeholder="Device Name"
              value={newDevice.name}
              onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
            />
            <Input
              placeholder="Manufacturer"
              value={newDevice.manufacturer}
              onChange={(e) => setNewDevice({ ...newDevice, manufacturer: e.target.value })}
            />
            <Input
              placeholder="Description"
              value={newDevice.description}
              onChange={(e) => setNewDevice({ ...newDevice, description: e.target.value })}
            />
            <Input
              placeholder="Device Class"
              value={newDevice.deviceClass}
              onChange={(e) => setNewDevice({ ...newDevice, deviceClass: e.target.value })}
            />
          </div>
          <Button
            className="mt-4"
            onClick={handleAddDevice}
            disabled={addDeviceMutation.isPending}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add to Whitelist
          </Button>
        </CardContent>
      </Card>

      {/* Whitelisted Devices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Whitelisted Devices</CardTitle>
          <CardDescription>
            Devices that are permanently allowed to connect
          </CardDescription>
        </CardHeader>
        <CardContent>
          {whitelistedDevices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No devices currently whitelisted
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device Name</TableHead>
                    <TableHead>Manufacturer</TableHead>
                    <TableHead>IDs</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Added By</TableHead>
                    <TableHead>Date Added</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {whitelistedDevices.map((device) => (
                    <TableRow key={device.id}>
                      <TableCell className="font-medium">{device.name}</TableCell>
                      <TableCell>{device.manufacturer || 'Unknown'}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {device.vendorId}:{device.productId}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{device.deviceClass || 'Unknown'}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <User className="h-4 w-4" />
                          <span>{device.addedBy}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {new Date(device.dateAdded).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeDeviceMutation.mutate(device.id)}
                          disabled={removeDeviceMutation.isPending}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WhitelistManager;
