import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { Notification } from "../src/modules/notifications/notification.model.js";

async function inspectNotifications() {
  try {
    await mongoose.connect(env.DATABASE.URI);
    
    // Find recent Membership expiry notifications
    const notifications = await Notification.find({ type: "System", title: /Member Expiry/ })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("recipient", "name email role chapter");
      
    console.log("Recent Expiry Notifications:");
    console.log(JSON.stringify(notifications, null, 2));

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.disconnect();
  }
}

inspectNotifications();
