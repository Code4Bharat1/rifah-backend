import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const auditSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, required: true },
  actorName: { type: String, required: true },
  actorRole: { type: String, required: true },
  action: { type: String, required: true },
  targetModel: { type: String, required: true },
  targetId: { type: String, required: true },
  summary: { type: String, required: true },
}, { timestamps: true });

const Audit = mongoose.model("Audit", auditSchema);

async function seedLogs() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/rifah");
    console.log("Connected to MongoDB");

    const dummyLogs = [
      {
        actor: new mongoose.Types.ObjectId(),
        actorName: "Super Admin",
        actorRole: "super_admin",
        action: "UPDATE",
        targetModel: "Business",
        targetId: new mongoose.Types.ObjectId().toString(),
        summary: "Approved business account 'Tech Innovators'",
        createdAt: new Date(Date.now() - 1000 * 60 * 5) // 5 mins ago
      },
      {
        actor: new mongoose.Types.ObjectId(),
        actorName: "Super Admin",
        actorRole: "super_admin",
        action: "CREATE",
        targetModel: "Notification",
        targetId: "global-bc-12345",
        summary: "Sent a global broadcast message to all users",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2) // 2 hours ago
      },
      {
        actor: new mongoose.Types.ObjectId(),
        actorName: "System",
        actorRole: "system",
        action: "DELETE",
        targetModel: "Event",
        targetId: new mongoose.Types.ObjectId().toString(),
        summary: "Automatically deleted expired event 'Annual Expo'",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24) // 1 day ago
      }
    ];

    await Audit.insertMany(dummyLogs);
    console.log("Dummy logs added successfully!");
    
    mongoose.connection.close();
  } catch (err) {
    console.error("Error:", err);
    mongoose.connection.close();
  }
}

seedLogs();
