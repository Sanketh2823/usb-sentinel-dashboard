
import { Link } from "react-router-dom";
import { Shield, List, Plus, Database } from "lucide-react";

const Dashboard = () => {
  const stats = [
    {
      title: "Total USB Events",
      value: "1,234",
      icon: Database,
      change: "+12.3%",
      changeType: "positive",
    },
    {
      title: "Blocked Attempts",
      value: "56",
      icon: Shield,
      change: "-5.4%",
      changeType: "negative",
    },
    {
      title: "Whitelisted Devices",
      value: "89",
      icon: List,
      change: "+3.2%",
      changeType: "positive",
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
        <Link
          to="/whitelist/add"
          className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Device
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.title}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:border-primary/20 transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <stat.icon className="w-8 h-8 text-primary" />
              <span
                className={`text-sm font-medium ${
                  stat.changeType === "positive" ? "text-success" : "text-destructive"
                }`}
              >
                {stat.change}
              </span>
            </div>
            <p className="mt-4 text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-sm text-gray-600">{stat.title}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4">Recent Events</h2>
          {/* Recent events table will go here */}
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-4">
            <Link
              to="/logs"
              className="flex items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Database className="w-6 h-6 text-primary mr-3" />
              <div>
                <h3 className="font-medium">View Logs</h3>
                <p className="text-sm text-gray-600">Check USB device activity</p>
              </div>
            </Link>
            <Link
              to="/whitelist"
              className="flex items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <List className="w-6 h-6 text-primary mr-3" />
              <div>
                <h3 className="font-medium">Manage Whitelist</h3>
                <p className="text-sm text-gray-600">Add or remove USB devices</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
