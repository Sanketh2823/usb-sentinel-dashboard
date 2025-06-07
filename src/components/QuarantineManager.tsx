
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, ShieldAlert, ShieldCheck, ShieldX, Clock, User } from 'lucide-react';
import { toast } from 'sonner';
import { fetchUSBDevices, addDeviceToWhitelist } from '@/lib/usb-service';

interface QuarantinedDevice {
  id: number;
  vendorId: string;
  productId: string;
  manufacturer: string;
  description: string;
  deviceClass: string;
  connectionType: string;
  quarantineDate: string;
  quarantineReason: string;
  riskLevel: 'low' | 'medium' | 'high';
  status: 'quarantined' | 'under-review' | 'approved' | 'blocked';
}

const QuarantineManager = () => {
  const [quarantinedDevices, setQuarantinedDevices] = useState<QuarantinedDevice[]>([]);
  const queryClient = useQueryClient();

  const { data: usbData, isLoading } = useQuery({
    queryKey: ['usb-devices'],
    queryFn: fetchUSBDevices,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (usbData?.quarantinedDevices) {
      setQuarantinedDevices(usbData.quarantinedDevices);
    }
  }, [usbData]);

  const approveDeviceMutation = useMutation({
    mutationFn: async (device: QuarantinedDevice) => {
      // Add to whitelist
      await addDeviceToWhitelist({
        vendorId: device.vendorId,
        productId: device.productId,
        manufacturer: device.manufacturer,
        description: device.description,
        deviceClass: device.deviceClass,
        name: `${device.manufacturer} ${device.description}`,
        username: 'Admin'
      });
      
      // Remove from quarantine
      return fetch('http://localhost:3001/api/quarantine/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          deviceId: device.id,
          adminAction: 'approved',
          adminUser: 'Admin',
          timestamp: new Date().toISOString()
        })
      });
    },
    onSuccess: () => {
      toast.success('Device approved and added to whitelist');
      queryClient.invalidateQueries({ queryKey: ['usb-devices'] });
    },
    onError: (error) => {
      toast.error('Failed to approve device');
      console.error('Approve device error:', error);
    }
  });

  const blockDeviceMutation = useMutation({
    mutationFn: async (device: QuarantinedDevice) => {
      return fetch('http://localhost:3001/api/quarantine/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          deviceId: device.id,
          adminAction: 'blocked',
          adminUser: 'Admin',
          timestamp: new Date().toISOString()
        })
      });
    },
    onSuccess: () => {
      toast.success('Device permanently blocked');
      queryClient.invalidateQueries({ queryKey: ['usb-devices'] });
    },
    onError: (error) => {
      toast.error('Failed to block device');
      console.error('Block device error:', error);
    }
  });

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'quarantined': return ShieldAlert;
      case 'under-review': return Clock;
      case 'approved': return ShieldCheck;
      case 'blocked': return ShieldX;
      default: return Shield;
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-32">Loading quarantine data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Alert for pending quarantined devices */}
      {quarantinedDevices.filter(d => d.status === 'quarantined').length > 0 && (
        <Alert className="border-orange-200 bg-orange-50">
          <ShieldAlert className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            {quarantinedDevices.filter(d => d.status === 'quarantined').length} device(s) in quarantine require admin review
          </AlertDescription>
        </Alert>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quarantined</CardTitle>
            <ShieldAlert className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {quarantinedDevices.filter(d => d.status === 'quarantined').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Under Review</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {quarantinedDevices.filter(d => d.status === 'under-review').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Risk</CardTitle>
            <ShieldX className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {quarantinedDevices.filter(d => d.riskLevel === 'high').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Processed</CardTitle>
            <Shield className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {quarantinedDevices.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quarantined Devices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Device Quarantine Center</CardTitle>
          <CardDescription>
            Review and manage devices that have been quarantined for security assessment
          </CardDescription>
        </CardHeader>
        <CardContent>
          {quarantinedDevices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No devices currently in quarantine
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Risk Level</TableHead>
                    <TableHead>Quarantine Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quarantinedDevices.map((device) => {
                    const StatusIcon = getStatusIcon(device.status);
                    return (
                      <TableRow key={device.id}>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <StatusIcon className="h-4 w-4" />
                            <Badge variant="outline">{device.status}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{device.manufacturer} {device.description}</div>
                            <div className="text-sm text-muted-foreground">
                              {device.vendorId}:{device.productId} ({device.deviceClass})
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getRiskLevelColor(device.riskLevel)}>
                            {device.riskLevel.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {new Date(device.quarantineDate).toLocaleString()}
                        </TableCell>
                        <TableCell>{device.quarantineReason}</TableCell>
                        <TableCell>
                          {device.status === 'quarantined' && (
                            <div className="flex space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => approveDeviceMutation.mutate(device)}
                                disabled={approveDeviceMutation.isPending}
                                className="text-green-600 hover:text-green-700"
                              >
                                <ShieldCheck className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => blockDeviceMutation.mutate(device)}
                                disabled={blockDeviceMutation.isPending}
                                className="text-red-600 hover:text-red-700"
                              >
                                <ShieldX className="h-4 w-4 mr-1" />
                                Block
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default QuarantineManager;
