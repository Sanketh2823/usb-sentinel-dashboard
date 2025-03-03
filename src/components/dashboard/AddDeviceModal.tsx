
import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DeviceFormData {
  productId: string;
  vendorId: string;
  manufacturer: string;
  username: string;
}

interface AddDeviceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddDevice: (device: DeviceFormData) => void;
}

const AddDeviceModal: React.FC<AddDeviceModalProps> = ({ open, onOpenChange, onAddDevice }) => {
  const [newDevice, setNewDevice] = useState<DeviceFormData>({
    productId: "",
    vendorId: "",
    manufacturer: "",
    username: ""
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewDevice(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    onAddDevice(newDevice);
    setNewDevice({
      productId: "",
      vendorId: "",
      manufacturer: "",
      username: ""
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <input
              id="productId"
              name="productId"
              value={newDevice.productId}
              onChange={handleInputChange}
              className="col-span-3 px-3 py-2 border rounded-md"
              placeholder="0x1234"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="vendorId" className="text-right">
              Vendor ID
            </label>
            <input
              id="vendorId"
              name="vendorId"
              value={newDevice.vendorId}
              onChange={handleInputChange}
              className="col-span-3 px-3 py-2 border rounded-md"
              placeholder="0x5678"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="manufacturer" className="text-right">
              Manufacturer
            </label>
            <input
              id="manufacturer"
              name="manufacturer"
              value={newDevice.manufacturer}
              onChange={handleInputChange}
              className="col-span-3 px-3 py-2 border rounded-md"
              placeholder="Kingston"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="username" className="text-right">
              Username
            </label>
            <input
              id="username"
              name="username"
              value={newDevice.username}
              onChange={handleInputChange}
              className="col-span-3 px-3 py-2 border rounded-md"
              placeholder="john.doe"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Add Device</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddDeviceModal;
