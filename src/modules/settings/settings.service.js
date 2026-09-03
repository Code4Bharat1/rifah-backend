import { Settings } from "./settings.model.js";

export const settingsService = {
  getSettings: async () => {
    let settings = await Settings.findOne({ isSingleton: "global" });
    if (!settings) {
      settings = await Settings.create({ isSingleton: "global" });
    }
    return settings;
  },
  
  updateSettings: async (updateData) => {
    const settings = await Settings.findOneAndUpdate(
      { isSingleton: "global" },
      { $set: updateData },
      { new: true, upsert: true }
    );
    return settings;
  }
};
