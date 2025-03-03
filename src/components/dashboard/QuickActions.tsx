
import React from "react";
import { Database, List } from "lucide-react";

interface QuickActionsProps {
  onViewLogs: () => void;
  onViewWhitelist: () => void;
  isMonitoring: boolean;
}

const QuickActions: React.FC<QuickActionsProps> = ({ onViewLogs, onViewWhitelist, isMonitoring }) => {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
      <div className="space-y-4">
        <div
          onClick={onViewLogs}
          className="flex items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <Database className="w-6 h-6 text-primary mr-3" />
          <div>
            <h3 className="font-medium">View Logs</h3>
            <p className="text-sm text-gray-600">Check USB device activity</p>
          </div>
        </div>
        <div
          onClick={onViewWhitelist}
          className="flex items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <List className="w-6 h-6 text-primary mr-3" />
          <div>
            <h3 className="font-medium">Manage Whitelist</h3>
            <p className="text-sm text-gray-600">Add or remove USB devices</p>
          </div>
        </div>
        <div className="mt-6">
          <h3 className="text-sm font-medium mb-2">Monitoring Status</h3>
          <div className={`p-3 rounded-md ${isMonitoring ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {isMonitoring ? (
              <div className="flex items-center">
                <div className="relative mr-3">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-full absolute top-0 animate-ping"></div>
                </div>
                <span>USB Monitoring Active</span>
              </div>
            ) : (
              <div className="flex items-center">
                <div className="w-3 h-3 bg-red-500 rounded-full mr-3"></div>
                <span>Monitoring Inactive</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickActions;
