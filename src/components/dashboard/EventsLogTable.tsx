
import React from "react";
import { Check, X, Filter } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface LogEntry {
  id: string | number;
  date: string | number | Date;
  productId: string;
  vendorId: string;
  manufacturer: string;
  username: string;
  status: string;
  action?: string;
}

interface EventsLogTableProps {
  logs: LogEntry[];
  statusFilter: string;
  usernameFilter: string;
  onStatusFilterChange: (value: string) => void;
  onUsernameFilterChange: (value: string) => void;
}

const EventsLogTable: React.FC<EventsLogTableProps> = ({
  logs,
  statusFilter,
  usernameFilter,
  onStatusFilterChange,
  onUsernameFilterChange
}) => {
  const filteredLogs = logs.filter((log) => {
    if (statusFilter !== "all" && log.status !== statusFilter) {
      return false;
    }
    
    if (usernameFilter && !log.username.toLowerCase().includes(usernameFilter.toLowerCase())) {
      return false;
    }
    
    return true;
  });

  return (
    <div>
      <h3 className="text-md font-medium mb-2">All USB Events</h3>
      
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium">Filter by:</span>
        </div>
        <div className="flex flex-1 flex-col sm:flex-row gap-4">
          <div className="w-full sm:w-1/3">
            <Select value={statusFilter} onValueChange={onStatusFilterChange}>
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
            <Input
              placeholder="Filter by username"
              value={usernameFilter}
              onChange={(e) => onUsernameFilterChange(e.target.value)}
              className="w-full"
            />
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
              <TableHead>Username</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{new Date(log.date).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(log.date).toLocaleTimeString()}</TableCell>
                  <TableCell>{log.productId}</TableCell>
                  <TableCell>{log.vendorId}</TableCell>
                  <TableCell>{log.manufacturer}</TableCell>
                  <TableCell>{log.username}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      log.status === "allowed" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}>
                      {log.status === "allowed" ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
                      {log.status}
                    </span>
                  </TableCell>
                  <TableCell>{log.action}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-4 text-gray-500">
                  No logs found matching your filters
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default EventsLogTable;
