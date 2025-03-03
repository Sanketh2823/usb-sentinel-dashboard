
import React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

interface BlockedDevice {
  id: string | number;
  date: string | number | Date;
  productId: string;
  vendorId: string;
  manufacturer: string;
  username: string;
  status: string;
}

interface BlockedAttemptsTableProps {
  devices: BlockedDevice[];
  onAddToWhitelist: (device: Omit<BlockedDevice, 'id' | 'date' | 'status'>) => void;
}

const BlockedAttemptsTable: React.FC<BlockedAttemptsTableProps> = ({ devices, onAddToWhitelist }) => {
  return (
    <div>
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
              <TableHead>Username</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.length > 0 ? (
              devices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell>{new Date(device.date).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(device.date).toLocaleTimeString()}</TableCell>
                  <TableCell>{device.productId}</TableCell>
                  <TableCell>{device.vendorId}</TableCell>
                  <TableCell>{device.manufacturer}</TableCell>
                  <TableCell>{device.username}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      <X className="w-3 h-3 mr-1" />
                      {device.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => onAddToWhitelist({
                        productId: device.productId,
                        vendorId: device.vendorId,
                        manufacturer: device.manufacturer,
                        username: device.username
                      })}
                    >
                      Add to Whitelist
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-4 text-gray-500">
                  No blocked attempts found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default BlockedAttemptsTable;
