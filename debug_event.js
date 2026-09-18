import mongoose from "mongoose";
import { Event } from "./src/modules/events/event.model.js";
import { User } from "./src/modules/users/user.model.js";

mongoose.connect("mongodb+srv://admin:rifah123@cluster0.letgjbr.mongodb.net/rifah?retryWrites=true&w=majority")
  .then(async () => {
    const events = await Event.find({ "registeredUsers.0": { $exists: true } }).populate("registeredUsers.user");
    for (const evt of events) {
      console.log(`Event: ${evt.title}`);
      for (const reg of evt.registeredUsers) {
        console.log(`- Reg: ${JSON.stringify(reg.user)}`);
      }
    }
    process.exit(0);
  })
  .catch(err => console.error(err));
