
import React from "react";
import { Check } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

interface Device {
  id: string | number;
  productId: string;
  vendorId: string;
  manufacturer: string;
  username: string;
  status: string;
}

interface WhitelistedDevicesTableProps {
  devices: Device[];
}

const WhitelistedDevicesTable: React.FC<WhitelistedDevicesTableProps> = ({ devices }) => {
  return (
    <div>
      <h3 className="text-md font-medium mb-2">Whitelisted Devices</h3>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product ID</TableHead>
              <TableHead>Vendor ID</TableHead>
              <TableHead>Manufacturer</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.length > 0 ? (
              devices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell>{device.productId}</TableCell>
                  <TableCell>{device.vendorId}</TableCell>
                  <TableCell>{device.manufacturer}</TableCell>
                  <TableCell>{device.username}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <Check className="w-3 h-3 mr-1" />
                      {device.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-4 text-gray-500">
                  No whitelisted devices found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default WhitelistedDevicesTable;
