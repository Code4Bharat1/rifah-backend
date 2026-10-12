import { Dignitary } from "./dignitary.model.js";
import { Event } from "../events/event.model.js";
import { NotFoundError } from "../../shared/errors/errors.js";

export const dignitaryService = {
  async getAll(query = {}) {
    // Auto-sync any existing event speakers that aren't yet in the Dignitary collection
    try {
      const eventsWithSpeakers = await Event.find({
        "speakers.0": { $exists: true },
      })
        .select("speakers")
        .lean();

      for (const ev of eventsWithSpeakers) {
        if (Array.isArray(ev.speakers)) {
          for (const sp of ev.speakers) {
            if (sp && sp.name && sp.name.trim()) {
              const filter = sp.mobile && sp.mobile.trim()
                ? { mobile: sp.mobile.trim() }
                : { name: new RegExp(`^${sp.name.trim()}$`, "i") };

              await Dignitary.findOneAndUpdate(
                filter,
                {
                  $set: {
                    name: sp.name.trim(),
                    category: sp.category || "",
                    mobile: sp.mobile || "",
                    email: sp.email || "",
                    org: sp.org || "",
                    designation: sp.designation || "",
                    type: sp.type || "Guest Speaker",
                    topic: sp.topic || "",
                  },
                },
                { upsert: true, new: true }
              );
            }
          }
        }
      }
    } catch (e) {
      // Non-blocking sync fail-safe
    }

    const filter = {};
    if (query.search) {
      const searchRegex = new RegExp(query.search, "i");
      filter.$or = [
        { name: searchRegex },
        { org: searchRegex },
        { designation: searchRegex },
        { topic: searchRegex },
        { mobile: searchRegex },
      ];
    }
    if (query.category) {
      filter.category = query.category;
    }
    if (query.type) {
      filter.type = query.type;
    }

    return await Dignitary.find(filter)
      .sort({ createdAt: -1 })
      .lean();
  },

  async getById(id) {
    const item = await Dignitary.findById(id).lean();
    if (!item) {
      throw new NotFoundError("Dignitary not found");
    }
    return item;
  },

  async create(data, user) {
    if (!data.name || !data.name.trim()) {
      throw new Error("Dignitary name is required");
    }

    // Check if dignitary already exists by mobile (if provided) or name (case-insensitive)
    let existing = null;
    if (data.mobile && data.mobile.trim()) {
      existing = await Dignitary.findOne({ mobile: data.mobile.trim() });
    }
    if (!existing && data.name && data.name.trim()) {
      existing = await Dignitary.findOne({
        name: new RegExp(`^${data.name.trim()}$`, "i"),
      });
    }

    if (existing) {
      if (data.name) existing.name = data.name.trim();
      if (data.mobile) existing.mobile = data.mobile.trim();
      if (data.category) existing.category = data.category;
      if (data.org) existing.org = data.org;
      if (data.designation) existing.designation = data.designation;
      if (data.type) existing.type = data.type;
      if (data.topic) existing.topic = data.topic;
      if (data.email) existing.email = data.email;
      if (data.city) existing.city = data.city;
      await existing.save();
      return existing.toObject();
    }

    const payload = {
      ...data,
      createdBy: user?._id || user?.id,
    };
    const created = await Dignitary.create(payload);
    return created.toObject();
  },

  async update(id, data) {
    const updated = await Dignitary.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      throw new NotFoundError("Dignitary not found");
    }
    return updated;
  },

  async delete(id) {
    const deleted = await Dignitary.findByIdAndDelete(id).lean();
    if (!deleted) {
      throw new NotFoundError("Dignitary not found");
    }
    return { success: true, id };
  },
};
