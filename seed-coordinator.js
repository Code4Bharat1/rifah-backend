import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB Atlas!");

  const User = mongoose.connection.db.collection("users");
  const Event = mongoose.connection.db.collection("events");

  // Find Mumbai Chapter ID
  const mumbaiChapter = await mongoose.connection.db
    .collection("chapters")
    .findOne({ name: /mumbai/i });
  console.log("Mumbai Chapter:", mumbaiChapter?._id, mumbaiChapter?.name);

  const passwordHash = await bcrypt.hash("Nexcore1234", 10);

  // Check if coordinator exists or create
  let coordinator = await User.findOne({ email: "coordinator@rifah.org" });
  if (!coordinator) {
    const insertRes = await User.insertOne({
      name: "Salman Shaikh (Events Coordinator)",
      email: "coordinator@rifah.org",
      passwordHash: passwordHash,
      role: "event_coordinator",
      accountType: "admin",
      status: "Active",
      isProfileComplete: true,
      chapter: "Mumbai Chapter",
      chapterId: mumbaiChapter?._id || null,
      phone: "9876543210",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    coordinator = await User.findOne({ _id: insertRes.insertedId });
    console.log("Created coordinator user:", coordinator._id);
  } else {
    await User.updateOne(
      { _id: coordinator._id },
      {
        $set: {
          role: "event_coordinator",
          accountType: "admin",
          status: "Active",
          passwordHash: passwordHash,
          chapter: "Mumbai Chapter",
          chapterId: mumbaiChapter?._id || coordinator.chapterId,
        },
      }
    );
    console.log("Updated coordinator user:", coordinator._id);
  }

  // Assign to Summit event and Mumbai event
  const eventsToAssign = await Event.find({
    $or: [{ chapter: "Mumbai Chapter" }, { chapter: /All Chapters/i }],
  }).toArray();

  for (const ev of eventsToAssign) {
    const filtered = (ev.roleAssignments || []).filter(
      (a) => a.role !== "eventCoordinator"
    );
    filtered.push({
      role: "eventCoordinator",
      user: coordinator._id,
      assignedAt: new Date(),
      _id: new mongoose.Types.ObjectId(),
    });

    const teamAssignments = ev.teamAssignments || {};
    teamAssignments.eventCoordinator = coordinator.name;
    teamAssignments.allowCoordinatorRemote = true;

    await Event.updateOne(
      { _id: ev._id },
      {
        $set: {
          roleAssignments: filtered,
          teamAssignments: teamAssignments,
        },
      }
    );
    console.log(`Assigned coordinator on event: ${ev.title} (${ev._id})`);
  }

  await mongoose.disconnect();
  console.log("Done seeding coordinator!");
}

main().catch(console.error);
