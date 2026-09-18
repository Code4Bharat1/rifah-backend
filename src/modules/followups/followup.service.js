import { Followup } from "./followup.model.js";
import { Event } from "../events/event.model.js";
import { User } from "../users/user.model.js";

export const followupService = {
  async getFollowups(filter = {}) {
    const query = {};
    if (filter.type) query.type = filter.type;
    if (filter.status && filter.status !== "all") query.status = filter.status;
    if (filter.eventId) query.event = filter.eventId;
    if (filter.chapter) {
      query.chapter = { $regex: new RegExp(filter.chapter.replace(/\s*[Cc]hapter\s*/g, ""), "i") };
    }
    if (filter.search) {
      const regex = new RegExp(filter.search, "i");
      query.$or = [{ name: regex }, { mobile: regex }, { company: regex }, { email: regex }];
    }

    const sort = { updatedAt: -1 };
    return await Followup.find(query).sort(sort).populate("event", "title date chapter venue").limit(200);
  },

  async getStats(chapter, eventId) {
    const baseQuery = {};
    if (chapter) {
      baseQuery.chapter = { $regex: new RegExp(chapter.replace(/\s*[Cc]hapter\s*/g, ""), "i") };
    }

    const eventQuery = { ...baseQuery, type: "event" };
    if (eventId) eventQuery.event = eventId;

    const [
      eventTotal,
      eventPending,
      eventContacted,
      eventInterested,
      eventCompleted,
      eventOverdue,
      membershipTotal,
      membershipPending,
      membershipOverdue,
      membershipExpiring,
      membershipExpired,
      membershipRenewed,
    ] = await Promise.all([
      Followup.countDocuments(eventQuery),
      Followup.countDocuments({ ...eventQuery, status: "pending" }),
      Followup.countDocuments({ ...eventQuery, status: "contacted" }),
      Followup.countDocuments({ ...eventQuery, status: "interested" }),
      Followup.countDocuments({ ...eventQuery, status: "completed" }),
      Followup.countDocuments({ ...eventQuery, status: "overdue" }),
      Followup.countDocuments({ ...baseQuery, type: "membership" }),
      Followup.countDocuments({ ...baseQuery, type: "membership", status: "pending" }),
      Followup.countDocuments({ ...baseQuery, type: "membership", status: "overdue" }),
      Followup.countDocuments({ ...baseQuery, type: "membership", status: "expiring_soon" }),
      Followup.countDocuments({ ...baseQuery, type: "membership", status: "expired" }),
      Followup.countDocuments({ ...baseQuery, type: "membership", status: "renewed" }),
    ]);

    return {
      event: {
        total: eventTotal,
        pending: eventPending,
        contacted: eventContacted,
        interested: eventInterested,
        completed: eventCompleted,
        waiting: eventOverdue,
      },
      membership: {
        total: membershipTotal,
        pending: membershipPending,
        overdue: membershipOverdue,
        expiringSoon: membershipExpiring,
        expired: membershipExpired,
        recentlyRenewed: membershipRenewed,
        prospects: membershipPending,
      },
    };
  },

  async syncFromEvent(eventId) {
    const event = await Event.findById(eventId).populate("attendees.user");
    if (!event) throw new Error("Event not found");

    let syncedCount = 0;
    const attendees = event.attendees || [];

    for (const att of attendees) {
      const name = att.name || att.user?.name || "Participant";
      const mobile = att.mobile || att.user?.phone || att.user?.mobile || "Not Provided";
      const email = att.email || att.user?.email || "";
      const company = att.company || att.businessName || "";

      const existing = await Followup.findOne({
        event: eventId,
        $or: [{ mobile }, { email: email || "non-existent" }],
      });

      if (!existing) {
        await Followup.create({
          type: "event",
          event: eventId,
          chapter: event.chapter || "Central Mumbai",
          name,
          mobile,
          email,
          company,
          status: "pending",
          category: att.ticketType || "Attendee",
        });
        syncedCount++;
      }
    }

    return { syncedCount, totalAttendees: attendees.length };
  },

  async updateStatus(id, status, note, author = "Admin") {
    const update = { status, lastContactedAt: new Date() };
    const doc = await Followup.findById(id);
    if (!doc) throw new Error("Followup record not found");

    if (note) {
      doc.notes.push({ content: note, author, createdAt: new Date() });
    }
    doc.status = status;
    doc.lastContactedAt = new Date();
    await doc.save();
    return doc;
  },

  async addNote(id, content, author = "Admin") {
    const doc = await Followup.findById(id);
    if (!doc) throw new Error("Followup record not found");
    doc.notes.push({ content, author, createdAt: new Date() });
    await doc.save();
    return doc;
  },

  async logMessage(id, { channel = "whatsapp", message }) {
    const doc = await Followup.findById(id);
    if (!doc) throw new Error("Followup record not found");
    doc.messageHistory.push({ channel, message, sentAt: new Date(), status: "sent" });
    doc.status = "contacted";
    doc.lastContactedAt = new Date();
    await doc.save();
    return doc;
  },

  async addHistory(id, { contactedBy = "Admin", method = "call", message = "", notes = "", status, nextFollowUpAt }) {
    const doc = await Followup.findById(id);
    if (!doc) throw new Error("Followup record not found");

    const newEntry = {
      contactedAt: new Date(),
      contactedBy,
      method,
      message,
      notes,
      status: status || doc.status,
    };

    if (!doc.history) doc.history = [];
    doc.history.push(newEntry);

    if (notes) {
      doc.notes.push({ content: notes, author: contactedBy, createdAt: new Date() });
    }
    if (message) {
      const channel = ["whatsapp", "sms", "email", "call"].includes(method) ? method : "whatsapp";
      doc.messageHistory.push({ channel, message, sentAt: new Date(), status: "sent" });
    }

    if (status) doc.status = status;
    doc.lastContactedAt = new Date();
    if (nextFollowUpAt) doc.nextFollowUpAt = new Date(nextFollowUpAt);

    await doc.save();
    return doc;
  },

  async deleteFollowup(id) {
    const doc = await Followup.findByIdAndDelete(id);
    if (!doc) throw new Error("Followup record not found");
    return doc;
  },
};
