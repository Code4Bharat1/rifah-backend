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
    if (event.targetAudience.includes("Consumers")) rolesToTarget.push(ROLES.CONSUMER);
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

    if (queryParams.chapter && !chapterScope.chapter) {
      filter.chapter = queryParams.chapter;
    }

    if (queryParams.status) {
      filter.status = new RegExp(`^${queryParams.status.trim()}$`, "i");
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
      (uId) => String(uId) === String(userId)
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
        $addToSet: { registeredUsers: userId },
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
};
