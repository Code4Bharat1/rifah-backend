import mongoose from "mongoose";
import cron from "node-cron";
import { Event } from "./event.model.js";
import { User } from "../users/user.model.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { generateSlug } from "../../shared/utils/generate-id.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../shared/errors/errors.js";
import { ROLES } from "../../shared/constants/roles.js";
import { STATUSES } from "../../shared/constants/statuses.js";
import { getChapterFilter, enforceBodyChapterScope, preventChapterModification } from "../../shared/utils/chapter-scope.js";

const broadcastEventToAudience = async (event) => {
  if (!event.targetAudience || event.targetAudience.length === 0 || event.status !== STATUSES.EVENT.UPCOMING) {
    return;
  }

  try {
    const rolesToTarget = [];
    if (event.targetAudience.includes("Consumers")) rolesToTarget.push(ROLES.CUSTOMER);
    if (event.targetAudience.includes("Businesses")) rolesToTarget.push(ROLES.BUSINESS_OWNER);
    if (event.targetAudience.includes("Chapter Admins")) rolesToTarget.push(ROLES.CHAPTER_ADMIN);

    if (rolesToTarget.length === 0) return;

    const users = await User.find({ role: { $in: rolesToTarget }, status: STATUSES.USER.ACTIVE });

    // Send notifications and emails
    for (const user of users) {
      await notificationService.createNotification({
        recipientId: user._id,
        type: "Event",
        title: "New Event: " + event.title,
        body: `You're invited to ${event.title} on ${event.date}`,
        entityId: event._id,
        link: "/events",
      });

      if (user.email) {
        await emailService.sendEventInvitationEmail({
          email: user.email,
          userName: user.name,
          eventTitle: event.title,
          eventDate: event.date,
          location: event.city || "Virtual",
          mode: event.mode || "In-person",
        });
      }
    }
  } catch (err) {
    console.error("Error broadcasting event to audience:", err);
  }
};

export const eventService = {
  /**
   * Browse public events
   */
  listEvents: async (queryParams = {}, user) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};

    // RBAC: Chapter Admin Scope Enforcement
    const chapterScope = await getChapterFilter(user, 'direct');
    Object.assign(filter, chapterScope);

    // Enforce Audience & Chapter Targeting for normal users
    if (user && [ROLES.BUSINESS_OWNER, ROLES.CUSTOMER].includes(user.role)) {
      // Must match role targeting
      const userRoleDisplay = user.role === ROLES.BUSINESS_OWNER ? "Businesses" : "Consumers";
      filter.targetAudience = { $in: [userRoleDisplay, "All"] };

      // Must match chapter targeting
      if (user.chapter) {
        filter.$or = [
          { targetChapters: "All" },
          { targetChapters: user.chapter },
          { chapter: user.chapter } // Also support the legacy chapter field
        ];
      }
    }

    if (queryParams.chapter && !chapterScope.chapter) {
      filter.chapter = queryParams.chapter;
    }

    if (queryParams.status) {
      if (queryParams.status.toLowerCase() === "past") {
        filter.date = { $lt: new Date().toISOString().split("T")[0] };
        filter.status = STATUSES.EVENT.UPCOMING; // Only show published past events
      } else if (queryParams.status.toLowerCase() === "upcoming") {
        filter.date = { $gte: new Date().toISOString().split("T")[0] };
        filter.status = STATUSES.EVENT.UPCOMING;
      } else {
        filter.status = new RegExp(`^${queryParams.status.trim()}$`, "i");
      }
    }

    if (queryParams.targetRole) {
      filter.targetAudience = { $in: [queryParams.targetRole, "All"] };
    }
    
    if (queryParams.city) filter.city = queryParams.city;
    if (queryParams.mode) filter.mode = queryParams.mode;

    let [events, total] = await Promise.all([
      Event.find(filter).sort(sort).skip(skip).limit(limit),
      Event.countDocuments(filter),
    ]);

    // Fallback: If status filter yields 0 events, show available events
    if (queryParams.status && events.length === 0) {
      delete filter.status;
      events = await Event.find(filter).sort(sort).skip(skip).limit(limit);
      total = await Event.countDocuments(filter);
    }

    return {
      events,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Get single event detail
   */
  getEventBySlugOrId: async (identifier, user) => {
    const isObjectId = identifier.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: identifier } : { slug: identifier };

    const chapterScope = await getChapterFilter(user, 'direct');
    const event = await Event.findOne({ ...query, ...chapterScope });
    if (!event) {
      throw new NotFoundError("Event not found or access denied");
    }
    
    return event;
  },

  /**
   * Create new event (Admin / Secretariat)
   */
  createEvent: async (data, user) => {
    let slug = generateSlug(data.title);
    const existing = await Event.findOne({ slug });
    if (existing) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // RBAC: Chapter Admin Scope Enforcement
    if (user && user.role === ROLES.CHAPTER_ADMIN) {
      data.chapter = user.chapter;
      // Force Pending Approval if they try to publish
      if (data.status === STATUSES.EVENT.UPCOMING) {
        data.status = STATUSES.EVENT.PENDING_APPROVAL;
      }
    }

    const event = await Event.create({
      ...data,
      slug,
    });

    if (data.targetAudience && data.targetAudience.length > 0 && event.status === STATUSES.EVENT.UPCOMING) {
      // Async broadcast so it doesn't block the request
      broadcastEventToAudience(event);
    }

    return event;
  },

  /**
   * Register user for an event
   */
  registerUserForEvent: async (eventId, userId) => {
    const event = await Event.findById(eventId);
    if (!event) {
      throw new NotFoundError("Event not found");
    }

    const isAlreadyRegistered = event.registeredUsers.some(
      (reg) => String(reg.user || reg) === String(userId)
    );

    if (isAlreadyRegistered) {
      throw new BadRequestError("You are already registered for this event");
    }

    if (event.registeredCount >= event.seats) {
      throw new BadRequestError("Event capacity has been reached");
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      eventId,
      {
        $addToSet: { registeredUsers: { user: userId, registeredAt: new Date(), status: "Confirmed" } },
        $inc: { registeredCount: 1 },
      },
      { new: true }
    );

    try {
      const user = await User.findById(userId);
      if (user?.email) {
        await emailService.sendEventRegistrationEmail({
          email: user.email,
          userName: user.name,
          eventTitle: updatedEvent.title,
          eventDate: updatedEvent.date || "Upcoming Chamber Event",
          location: updatedEvent.venue || updatedEvent.location || "Chamber Main Hall",
          ticketType: "Member Pass",
        });
      }

      // In-app notification for the customer
      await notificationService.createNotification({
        recipientId: userId,
        type: "Event",
        title: "Event Registration Confirmed",
        body: `Your registration for "${updatedEvent.title}" is confirmed!`,
        entityId: updatedEvent._id,
        link: "/events"
      });
    } catch (err) {}

    return updatedEvent;
  },

  /**
   * Get registered users for an event
   */
  getEventRegistrations: async (eventId, user) => {
    const chapterScope = await getChapterFilter(user, 'direct');
    const event = await Event.findOne({ _id: eventId, ...chapterScope }).lean();

    if (!event) {
      throw new NotFoundError("Event not found or access denied");
    }

    const registrations = [];
    for (const entry of (event.registeredUsers || [])) {
      // Handle all possible formats: plain string, ObjectId, or { user: ObjectId }
      let userId;
      let registeredAt = event.createdAt;
      let status = "Confirmed";

      if (typeof entry === "string" || entry instanceof mongoose.Types.ObjectId) {
        userId = entry;
      } else if (entry && typeof entry === "object") {
        userId = entry.user || entry._id;
        registeredAt = entry.registeredAt || event.createdAt;
        status = entry.status || "Confirmed";
      }

      if (!userId) continue;

      const userData = await User.findById(userId).select("name email phone role chapter businessName").lean();
      registrations.push({
        user: userData || { name: "Deleted User", email: "N/A" },
        registeredAt,
        status,
      });
    }

    return registrations;
  },

  /**
   * Update event details
   */
  updateEvent: async (id, updateData, user) => {
    const chapterScope = await getChapterFilter(user, 'direct');
    const existing = await Event.findOne({ _id: id, ...chapterScope });
    if (!existing) {
      throw new NotFoundError("Event not found or access denied");
    }

    // RBAC: Chapter Admin Scope Enforcement
    if (user && user.role === ROLES.CHAPTER_ADMIN) {
      delete updateData.chapter; // Prevent modifying chapter
      // If chapter admin tries to publish or edit a published event, push it to Pending Approval
      if (updateData.status === STATUSES.EVENT.UPCOMING) {
        updateData.status = STATUSES.EVENT.PENDING_APPROVAL;
      }
    }

    if (updateData.title && updateData.title !== existing.title) {
      updateData.slug = generateSlug(updateData.title);
    }
    const updated = await Event.findByIdAndUpdate(id, updateData, { new: true });
    
    // Only broadcast if status changed to UPCOMING
    if (existing.status !== STATUSES.EVENT.UPCOMING && updated.status === STATUSES.EVENT.UPCOMING) {
      broadcastEventToAudience(updated);
    }

    return updated;
  },

  /**
   * Delete event
   */
  deleteEvent: async (id, user) => {
    const chapterScope = await getChapterFilter(user, 'direct');
    const existing = await Event.findOne({ _id: id, ...chapterScope });
    if (!existing) {
      throw new NotFoundError("Event not found or access denied");
    }

    const deleted = await Event.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundError("Event not found");
    }
    return deleted;
  },

  /**
   * Start the scheduler to publish scheduled events automatically
   */
  startEventScheduler: () => {
    // Run every minute
    cron.schedule("* * * * *", async () => {
      try {
        if (mongoose.connection.readyState !== 1) {
          return; // Database not in connected state, skip this run
        }
        const now = new Date();
        const scheduledEvents = await Event.find({
          status: STATUSES.EVENT.SCHEDULED,
          scheduledAt: { $lte: now }
        });

        for (const event of scheduledEvents) {
          event.status = STATUSES.EVENT.UPCOMING;
          await event.save();
          console.log(`[EventScheduler] Auto-published event: ${event.title}`);
          
          if (event.targetAudience && event.targetAudience.length > 0) {
            broadcastEventToAudience(event);
          }
        }
      } catch (error) {
        if (error.name !== "MongoServerSelectionError" && error.name !== "MongoNetworkError") {
          console.error("[EventScheduler] Error auto-publishing events:", error.message || error);
        }
      }
    });
    console.log("[EventScheduler] Started checking for scheduled events...");
  }
};
