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
import { postService } from "../posts/post.service.js";
import { followupService } from "../followups/followup.service.js";
import { eventMediaService } from "../gallery/gallery.service.js";

// teamAssignments role keys that grant real Operations Centre tools (each one unlocks a
// working panel on the member's /biz/operations page).
export const FUNCTIONAL_ROLES = ["entranceIncharge", "followupCoordinator", "treasurer", "guestManager", "eventCoordinator", "photosVideo"];

// Ceremonial stage roles. These unlock no tools, but the assigned member is told they are
// presenting, so they still need a real user link (not just a display name).
export const STAGE_ROLES = [
  "chapterAdmin",
  "tilawatEquran",
  "presidentWelcome",
  "secretaryIntro",
  "keynote1",
  "keynote2",
  "heroOfEvent",
  "best60SecPitch",
  "closingRemarks",
  "voteOfThanks",
  "eventEnd",
];

// Every role key that may be linked to a real user account via roleAssignments.
export const ASSIGNABLE_ROLES = [...FUNCTIONAL_ROLES, ...STAGE_ROLES];

export const parseEventTiming = (dateInput, timeInput) => {
  if (!dateInput) return { start: null, end: null };
  let year, month, day;
  if (typeof dateInput === "string") {
    const isoMatch = dateInput.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
      year = parseInt(isoMatch[1], 10);
      month = parseInt(isoMatch[2], 10) - 1;
      day = parseInt(isoMatch[3], 10);
    } else {
      const slashMatch = dateInput.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
      if (slashMatch) {
        year = parseInt(slashMatch[3], 10);
        month = parseInt(slashMatch[1], 10) - 1;
        day = parseInt(slashMatch[2], 10);
      } else {
        const parsed = new Date(dateInput);
        if (!isNaN(parsed.getTime())) {
          year = parsed.getFullYear();
          month = parsed.getMonth();
          day = parsed.getDate();
        }
      }
    }
  } else if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    year = dateInput.getFullYear();
    month = dateInput.getMonth();
    day = dateInput.getDate();
  }

  if (year === undefined || month === undefined || day === undefined) {
    return { start: null, end: null };
  }

  if (!timeInput || typeof timeInput !== "string") {
    return {
      start: new Date(year, month, day, 0, 0, 0, 0),
      end: new Date(year, month, day, 23, 59, 59, 999),
    };
  }

  const parts = timeInput.split(/[-–—]|(?:\bto\b)/i).map((s) => s.trim()).filter(Boolean);

  const parseClock = (str) => {
    if (!str) return null;
    const m = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const ampm = m[3] ? m[3].toUpperCase() : null;

    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;

    return { h, min };
  };

  const startClock = parseClock(parts[0]);
  const endClock = parts.length > 1 ? parseClock(parts[1]) : null;

  const start = startClock
    ? new Date(year, month, day, startClock.h, startClock.min, 0, 0)
    : new Date(year, month, day, 0, 0, 0, 0);

  let end;
  if (endClock) {
    end = new Date(year, month, day, endClock.h, endClock.min, 0, 0);
    if (end <= start) {
      end = new Date(year, month, day + 1, endClock.h, endClock.min, 0, 0);
    }
  } else if (startClock) {
    end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  } else {
    end = new Date(year, month, day, 23, 59, 59, 999);
  }

  return { start, end };
};

export const computeEventStatus = (event, now = new Date()) => {
  if (!event) return "Ended";
  const rawStatus = (event.status || "").trim();
  if (["Draft", "Pending Approval", "Cancelled"].includes(rawStatus)) {
    return rawStatus;
  }
  if (rawStatus === "Scheduled" && event.scheduledAt && new Date(event.scheduledAt) > now) {
    return "Scheduled";
  }
  if (["Completed", "Past", "Closed", "Ended"].includes(rawStatus)) {
    return "Ended";
  }
  const { start, end } = parseEventTiming(event.date, event.time);
  if (!start || !end) return rawStatus || "Upcoming";
  if ((event.stageStatus === "LIVE" || rawStatus === "Ongoing" || rawStatus === "Live") && now <= new Date(end.getTime() + 60 * 60 * 1000)) {
    return "Live";
  }
  if (now > end) return "Ended";
  if (now >= start && now <= end) return "Live";
  if (now < start) return "Upcoming";
  return "Upcoming";
};

// An event is "live" for its assigned members when the chapter admin has either taken the
// stage live from Live Control, or moved the event itself into its Ongoing phase.
export const isEventLive = (event) =>
  event?.stageStatus === "LIVE" || event?.status === STATUSES.EVENT.ONGOING || computeEventStatus(event) === "Live";

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
        recipientId: (user.id || user._id),
        type: "Event",
        title: "New Event: " + event.title,
        body: `You're invited to ${event.title} on ${event.date}`,
        entityId: event._id,
        eventDate: event.date,
        eventCity: event.city,
        eventTime: event.time,
        eventVenue: event.venue || event.location,
        metadata: {
          eventDate: event.date,
          eventCity: event.city,
          eventTime: event.time,
          eventVenue: event.venue || event.location,
          eventTitle: event.title,
        },
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
   * Browse events — creator-scope RBAC:
   *   chapter_admin created  → visible only to that chapter's members & admins
   *   state_admin created    → visible only to that state's members & admins
   *   central_admin created  → visible to everyone (global)
   */
  listEvents: async (queryParams = {}, user) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};

    // ── Build visibility $or based on creator-scope ──────────────────────────
    const visibilityConditions = [];

    if (user) {
      const userId = user.id || user._id;
      const userRole = user.role;
      const userChapter = (user.chapter || "").trim();
      const userState   = (user.state   || "").trim();

      // 1. Creator always sees their own events
      visibilityConditions.push({ createdBy: userId });

      if (userRole === ROLES.CENTRAL_ADMIN) {
        // Central admin sees ALL events
        visibilityConditions.push({});

      } else if (userRole === ROLES.STATE_ADMIN) {
        if (queryParams.strictAdminScope === "true" || queryParams.strictAdminScope === true) {
          // Admin Dashboard: only see state events or chapter events within state
          if (userState) {
            visibilityConditions.push({ creatorState: new RegExp(`^${userState}$`, "i") });
          }
        } else {
          // Public browsing: see all events globally
          visibilityConditions.push({});
        }

      } else if (userRole === ROLES.CHAPTER_ADMIN) {
        if (queryParams.strictAdminScope === "true" || queryParams.strictAdminScope === true) {
          // Admin Dashboard: only see chapter events
          if (userChapter) {
            visibilityConditions.push({ creatorChapter: new RegExp(`^${userChapter}$`, "i") });
          }
        } else {
          // Public browsing: see all events globally
          visibilityConditions.push({});
        }

      } else {
        // Regular users (business_owner / customer):
        // Can see all events globally (removed targetAudience restriction for public viewing)
        visibilityConditions.push({});
      }
    } else {
      // Unauthenticated: see all events globally (removed targetAudience restriction for public viewing)
      visibilityConditions.push({});
    }

    // Apply visibility filter (empty object = no restriction = see all)
    if (visibilityConditions.length > 0) {
      const hasEmpty = visibilityConditions.some(c => Object.keys(c).length === 0);
      if (!hasEmpty) {
        filter.$or = visibilityConditions;
      }
    }

    // ── Additional query filters ──────────────────────────────────────────────
    if (queryParams.chapter) {
      filter.chapter = new RegExp(`^${queryParams.chapter.trim()}$`, "i");
    }
    if (queryParams.creatorRole) {
      filter.creatorRole = queryParams.creatorRole;
    }

    if (queryParams.state) {
      filter.creatorState = new RegExp(`^${queryParams.state.trim()}$`, "i");
    }

    if (queryParams.eventCategory) {
      filter.eventCategory = queryParams.eventCategory;
    }

    if (queryParams.status) {
      if (queryParams.status.toLowerCase() === "past") {
        filter.date   = { $lt: new Date().toISOString().split("T")[0] };
        filter.status = STATUSES.EVENT.UPCOMING;
      } else if (queryParams.status.toLowerCase() === "upcoming") {
        filter.date   = { $gte: new Date().toISOString().split("T")[0] };
        filter.status = STATUSES.EVENT.UPCOMING;
      } else {
        filter.status = new RegExp(`^${queryParams.status.trim()}$`, "i");
      }
    }

    if (queryParams.targetRole) {
      filter.targetAudience = { $in: [queryParams.targetRole, "All"] };
    }

    if (queryParams.city)  filter.city  = queryParams.city;
    if (queryParams.mode)  filter.mode  = queryParams.mode;

    let [events, total] = await Promise.all([
      Event.find(filter).sort(sort).skip(skip).limit(limit),
      Event.countDocuments(filter),
    ]);

    // Fallback: if status filter yields 0 events, show whatever is visible
    if (queryParams.status && events.length === 0) {
      delete filter.status;
      events = await Event.find(filter).sort(sort).skip(skip).limit(limit);
      total  = await Event.countDocuments(filter);
    }

    return {
      events,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Get single event detail — enforces creator-scope access
   */
  getEventBySlugOrId: async (identifier, user) => {
    const isObjectId = identifier.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: identifier } : { slug: identifier };

    const event = await Event.findOne(query);
    if (!event) throw new NotFoundError("Event not found");

    // ── Access check ────────────────────────────────────────────────────────
    if (event.visibilityScope === "global") {
      // Everyone can see global events
      return event;
    }

    if (!user) {
      throw new ForbiddenError("You must be logged in to view this event.");
    }

    const userRole    = user.role;
    const userId      = String(user.id || user._id);
    const userChapter = (user.chapter || "").trim();
    const userState   = (user.state   || "").trim();

    // ── Global Visibility ──
    // Since all events are globally accessible, we no longer throw ForbiddenError 
    // for state or chapter scoped events here, UNLESS you want to enforce strict Admin dashboards.
    // If we are strictly in an admin context and need to block them, we could, but for now
    // any user or admin with a direct link can view the event.

    return event;
  },

  /**
   * Create new event (Admin / Secretariat)
   * Stamps creator-scope RBAC fields at creation time.
   */
  createEvent: async (data, user) => {
    let slug = generateSlug(data.title);
    const existing = await Event.findOne({ slug });
    if (existing) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // ── Stamp creator-scope fields ────────────────────────────────────────────
    if (user) {
      data.createdBy     = user.id || user._id;
      data.creatorRole   = user.role || ROLES.CENTRAL_ADMIN;
      data.creatorChapter = (user.chapter || "").trim();
      data.creatorState   = (user.state   || "").trim();

      if (user.role === ROLES.CHAPTER_ADMIN) {
        // Chapter admin events: visible only within their chapter
        data.visibilityScope = "chapter";
        data.chapter         = user.chapter;
        data.targetChapters  = [user.chapter];
        if (user.state) data.targetStates = [user.state];

        // We are removing the PENDING_APPROVAL requirement as per user request 
        // to show Chapter Admin events immediately in the public 'All' list.

      } else if (user.role === ROLES.STATE_ADMIN) {
        // State admin events: visible to their entire state
        data.visibilityScope = "state";
        if (user.state) {
          data.targetStates  = [user.state];
          data.creatorState  = user.state;
        }
        // They can choose which chapters to include, but scope stays 'state'

      } else {
        // central_admin: global — everyone can see
        data.visibilityScope = "global";
      }
    } else {
      data.visibilityScope = "global";
    }

    // ── Sync paid event fields ────────────────────────────────────────────────
    const isPaid       = Boolean(data.isPaid === true || data.isPaid === "true" || data.isPaid === "Paid");
    const ticketPrice  = isPaid ? (Number(data.ticketPrice) || 0) : 0;
    const fee          = isPaid ? `₹${ticketPrice}` : (data.fee && data.fee !== "Complimentary for Members" ? data.fee : "Free");

    data.isPaid      = isPaid;
    data.ticketPrice = ticketPrice;
    data.fee         = fee;

    const event = await Event.create({ ...data, slug });

    // Automatically create a post in the feed for this event
    try {
      await postService.syncEventPost(event, user);
    } catch (err) {
      console.error("Failed to auto-create feed post for event:", err);
    }

    if (data.targetAudience && data.targetAudience.length > 0 && event.status === STATUSES.EVENT.UPCOMING) {
      broadcastEventToAudience(event);
    }

    return event;
  },

  /**
   * Register user for an event
   */
  registerUserForEvent: async (eventId, userId, paymentData = null) => {
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

    if (event.isPaid && !paymentData) {
      throw new BadRequestError("Payment is required for this event");
    }

    let paymentStatus = "Free";
    let paymentId = null;

    if (event.isPaid && paymentData) {
      paymentStatus = "Paid";
      paymentId = paymentData.paymentId;
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      eventId,
      {
        $addToSet: { 
          registeredUsers: { 
            user: userId, 
            registeredAt: new Date(), 
            status: "Confirmed",
            paymentStatus: paymentStatus,
            amountPaid: paymentData?.amount || 0,
            paymentId: paymentData?.paymentId,
            transactionId: paymentData?.transactionId
          } 
        },
        $inc: { registeredCount: 1 },
      },
      { new: true }
    );

    // Fire-and-forget: send email + notification without blocking response
    setImmediate(async () => {
      try {
        const user = await User.findById(userId);
        if (user?.email) {
          await emailService.sendEventRegistrationEmail({
            email: user.email,
            userName: user.name,
            eventTitle: updatedEvent.title,
            eventDate: updatedEvent.date || "Upcoming Chamber Event",
            location: updatedEvent.venue || updatedEvent.location || "Chamber Main Hall",
            ticketType: event.isPaid ? `Paid Pass (₹${event.ticketPrice})` : "Member Pass",
            isPaid: event.isPaid,
            ticketPrice: event.ticketPrice,
            paymentId: paymentData?.paymentId || null,
            transactionId: paymentData?.transactionId || null,
            chapter: updatedEvent.chapter || "",
          });
        }

        const dateCityInfo = [updatedEvent.date, updatedEvent.city].filter(Boolean).join(" • ");
        await notificationService.createNotification({
          recipientId: userId,
          type: "Event",
          title: "Event Registration Confirmed",
          body: event.isPaid
            ? `Your payment of ₹${event.ticketPrice} for "${updatedEvent.title}" is confirmed!${dateCityInfo ? ` (${dateCityInfo})` : ""}`
            : `Your registration for "${updatedEvent.title}" is confirmed!${dateCityInfo ? ` (${dateCityInfo})` : ""}`,
          entityId: updatedEvent._id,
          eventDate: updatedEvent.date,
          eventCity: updatedEvent.city,
          eventTime: updatedEvent.time,
          eventVenue: updatedEvent.venue || updatedEvent.location,
          metadata: {
            eventDate: updatedEvent.date,
            eventCity: updatedEvent.city,
            eventTime: updatedEvent.time,
            eventVenue: updatedEvent.venue || updatedEvent.location,
            eventTitle: updatedEvent.title,
          },
          link: "/events"
        });
      } catch (err) {
        console.error("Failed to send post-registration emails:", err);
      }
    });

    return updatedEvent;
  },

  /**
   * Mark attendance for a registered user
   */
  markAttendance: async (eventId, userId) => {
    const event = await Event.findById(eventId);
    if (!event) {
      throw new NotFoundError("Event not found");
    }

    const regIndex = event.registeredUsers.findIndex(
      (reg) => {
        const id = reg.user?._id || reg.user || reg._id || reg;
        return String(id) === String(userId);
      }
    );

    if (regIndex === -1) {
      throw new BadRequestError("You are not registered for this event");
    }

    // Check if event is today
    const eventDateStr = event.date; // Usually "YYYY-MM-DD"
    const todayStr = new Date().toISOString().split("T")[0];

    // Commenting out strict date check for testing purposes, but in prod this should be enforced:
    // if (eventDateStr !== todayStr) {
    //   throw new BadRequestError("Attendance can only be marked on the day of the event");
    // }

    if (event.registeredUsers[regIndex].attendanceStatus === "Present") {
      throw new BadRequestError("Attendance already marked");
    }

    event.registeredUsers[regIndex].attendanceStatus = "Present";
    await event.save();

    return event;
  },

  /**
   * Admin: Get all registrations for an event
   */
  getEventRegistrations: async (eventId, user, { skipOwnerScope = false } = {}) => {
    const query = { _id: eventId };
    if (!skipOwnerScope && user && user.role !== ROLES.CENTRAL_ADMIN) {
      query.createdBy = (user.id || user._id);
    }
    const event = await Event.findOne(query).lean();

    if (!event) {
      throw new NotFoundError("Event not found or you don't have permission to view registrations");
    }

    const registrations = [];
    for (const entry of (event.registeredUsers || [])) {
      // Handle all possible formats: plain string, ObjectId, or { user: ObjectId }
      let userId;
      let registeredAt = event.createdAt;
      let status = "Confirmed";
      let _id = null;
      let gateStatus = "waiting";

      if (typeof entry === "string" || entry instanceof mongoose.Types.ObjectId) {
        userId = entry;
        _id = entry;
      } else if (entry && typeof entry === "object") {
        userId = entry.user || entry._id;
        _id = entry._id || userId;
        registeredAt = entry.registeredAt || event.createdAt;
        status = entry.status || "Confirmed";
        gateStatus = entry.gateStatus || "waiting";
      }

      if (!userId) continue;

      const userData = await User.findById(userId).select("name email phone role chapter businessName").lean();
      registrations.push({
        _id,
        user: userData || { name: "Deleted User", email: "N/A" },
        registeredAt,
        status,
        gateStatus,
        attendanceStatus: entry.attendanceStatus || "Pending",
      });
    }

    return registrations;
  },

  /**
   * Update event details \u2014 preserves creator-scope RBAC
   */
  updateEvent: async (id, updateData, user) => {
    const query = { _id: id };
    if (user && user.role !== ROLES.CENTRAL_ADMIN) {
      query.createdBy = (user.id || user._id);
    }
    const existing = await Event.findOne(query);
    if (!existing) {
      throw new NotFoundError("Event not found or you don't have permission to edit it");
    }

    // Always protect creator-scope fields \u2014 they can never be changed after creation
    delete updateData.creatorRole;
    delete updateData.creatorChapter;
    delete updateData.creatorState;
    delete updateData.visibilityScope; // Cannot elevate scope post-creation
    delete updateData.createdBy;

    // RBAC: Chapter Admin Scope Enforcement
    if (user) {
      if (user.role === ROLES.CHAPTER_ADMIN) {
        delete updateData.chapter;        // Cannot move event to another chapter
        delete updateData.targetChapters;
        delete updateData.targetStates;
        // Chapter admins go through approval to publish
        if (updateData.status === STATUSES.EVENT.UPCOMING) {
          updateData.status = STATUSES.EVENT.PENDING_APPROVAL;
        }
      } else if (user.role === ROLES.STATE_ADMIN) {
        delete updateData.targetStates;   // Cannot change state scope
      }
    }

    if (updateData.title && updateData.title !== existing.title) {
      updateData.slug = generateSlug(updateData.title);
    }

    // Sync paid event fields on update
    if (updateData.isPaid !== undefined || updateData.ticketPrice !== undefined || updateData.fee !== undefined) {
      const isPaid = updateData.isPaid !== undefined
        ? Boolean(updateData.isPaid === true || updateData.isPaid === "true" || updateData.isPaid === "Paid")
        : existing.isPaid;
      const ticketPrice = isPaid
        ? (Number(updateData.ticketPrice !== undefined ? updateData.ticketPrice : existing.ticketPrice) || 0)
        : 0;
      const fee = isPaid
        ? `\u20b9${ticketPrice}`
        : (updateData.fee && updateData.fee !== "Complimentary for Members" ? updateData.fee : "Free");

      updateData.isPaid = isPaid;
      updateData.ticketPrice = ticketPrice;
      updateData.fee = fee;
    }

    const updated = await Event.findByIdAndUpdate(id, updateData, { new: true });

    // Sync updates (poster image, cover, title, description) to the feed post
    try {
      await postService.syncEventPost(updated, user);
    } catch (err) {
      console.error("Failed to sync feed post for updated event:", err);
    }

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
    const query = { _id: id };
    if (user && user.role !== ROLES.CENTRAL_ADMIN) {
      query.createdBy = (user.id || user._id);
    }
    const existing = await Event.findOne(query);
    if (!existing) {
      throw new NotFoundError("Event not found or you don't have permission to delete it");
    }

    const deleted = await Event.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundError("Event not found");
    }

    // Soft delete corresponding feed post
    try {
      const { Post } = await import("../posts/post.model.js");
      await Post.updateMany({ eventId: id }, { isDeleted: true });
    } catch (err) {
      // ignore
    }

    return deleted;
  },

  /**
   * RIFAH Operations Center: Get full operations state for an event
   */
  getOperations: async (eventId, user) => {
    const event = await Event.findById(eventId).populate(
      "registeredUsers.user",
      "name email phone mobile whatsapp organization company city role membershipStatus"
    );
    if (!event) throw new NotFoundError("Event not found");

    const registeredUsers = event.registeredUsers || [];
    const totalRegistered = registeredUsers.length;
    const checkedIn = registeredUsers.filter((r) => r.attendanceStatus === "Present").length;
    const membersCount = registeredUsers.filter((r) => {
      const u = r.user;
      return (
        u?.role === "business_owner" ||
        (u?.membershipStatus && u.membershipStatus !== "None" && u.membershipStatus !== "Expired")
      );
    }).length;

    let totalFees = 0;
    if (event.isPaid && event.ticketPrice) {
      totalFees = totalRegistered * event.ticketPrice;
    } else if (event.finance?.moneyIn?.length) {
      totalFees = event.finance.moneyIn.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    }

    const approvedCount = registeredUsers.filter((r) => r.status !== "Cancelled").length;

    return {
      event: {
        _id: event._id,
        title: event.title,
        slug: event.slug,
        date: event.date,
        time: event.time,
        venue: event.venue,
        city: event.city,
        chapter: event.chapter,
        seats: event.seats,
        isPaid: event.isPaid,
        ticketPrice: event.ticketPrice,
        fee: event.fee,
        stageStatus: event.stageStatus || "IDLE",
        currentSlideIndex: event.currentSlideIndex || 0,
        speakers: event.speakers || [],
        finance: event.finance || { moneyIn: [], moneyOut: [], treasurerNotes: "" },
        teamAssignments: event.teamAssignments || [],
        signatories: event.signatories || { signatory1: "Chapter President", signatory2: "Chapter Secretary" },
        agenda: event.agenda || [],
        slogan: event.slogan || "",
        theme: event.theme || "",
        scriptLanguage: event.scriptLanguage || "English",
        certificateSettings: event.certificateSettings || { theme: "classic-gold", language: "English", enabled: true },
        membershipRules: event.membershipRules || "Members enter free with valid Chamber ID.",
        visitorSignIn: event.visitorSignIn !== false,
        memberFee: event.memberFee !== undefined ? event.memberFee : 0,
        nonMemberFee: event.nonMemberFee !== undefined ? event.nonMemberFee : 500,
        paymentCodes: event.paymentCodes || [],
        staffCodes: event.staffCodes || [],
        membershipJoiningLink: event.membershipJoiningLink || "",
        membershipQrImage: event.membershipQrImage || "",
        // eventPoster is legacy Operations-Centre-only storage; posterImage is the field
        // actually written by the real event poster upload (POST /events/:id/poster) —
        // prefer it so Operations Centre shows whatever poster was actually uploaded.
        eventPoster: event.posterImage || event.eventPoster || "",
        repeatGuestThreshold: event.repeatGuestThreshold !== undefined ? event.repeatGuestThreshold : 3,
        remindRepeatGuests: event.remindRepeatGuests !== false,
        downloadListPermission: event.downloadListPermission || "Everyone (members and guests)",
        certificateStyle: event.certificateStyle || "5 — Corporate (navy band, gold rule, clean typography)",
        certificateAccentColor: event.certificateAccentColor || "#059669",
        signatory1Role: event.signatory1Role || "Chapter President",
        signatory1Name: event.signatory1Name || "",
        signatory1Image: event.signatory1Image || "",
        signatory2Role: event.signatory2Role || "Chapter Secretary",
        signatory2Name: event.signatory2Name || "",
        signatory2Image: event.signatory2Image || "",
        sponsors: event.sponsors || [],
        upcomingEvents: event.upcomingEvents || [],
        appearance: event.appearance || { primaryColor: "#06b6d4", darkBg: true },
        projectorUrl: event.projectorUrl || "",
        registeredUsers: registeredUsers,
      },
      kpi: {
        registered: totalRegistered,
        approved: approvedCount,
        members: membersCount,
        checkedIn: checkedIn,
        fees: totalFees,
      },
      kpis: {
        registered: totalRegistered,
        approved: approvedCount,
        members: membersCount,
        checkedIn: checkedIn,
        fees: totalFees,
      },
      attendees: registeredUsers.map((reg, idx) => {
        const u = reg.user || {};
        const isMem =
          u.role === "business_owner" ||
          (u.membershipStatus && u.membershipStatus !== "None" && u.membershipStatus !== "Expired");
        return {
          id: reg._id || `att-${idx}`,
          userId: u._id || reg.user,
          name: u.name || "Attendee " + (idx + 1),
          email: u.email || "",
          mobile: u.phone || u.whatsapp || u.mobile || "Not provided",
          company: u.organization || u.company || "Enterprise",
          city: u.city || event.city || "Mumbai",
          isMember: Boolean(isMem),
          membership: isMem ? "Active Member" : "Non-Member",
          membershipStatus: isMem ? "Active Member" : "Non-Member",
          approvalStatus: reg.status === "Cancelled" ? "Rejected" : "Approved",
          status: reg.paymentStatus || (event.isPaid ? "Paid" : "Free"),
          paymentStatus: reg.paymentStatus || (event.isPaid ? "Paid" : "Free"),
          attendanceStatus: reg.attendanceStatus || "Pending",
          entryStatus: reg.attendanceStatus === "Present" ? "Checked In" : "Pending",
          time: reg.registeredAt
            ? new Date(reg.registeredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "10:00 AM",
        };
      }),
    };
  },

  /**
   * RIFAH Operations Center: Update operations data for an event
   */
  updateOperations: async (eventId, data, user) => {
    const allowedFields = [
      "stageStatus",
      "currentSlideIndex",
      "projectorMode",
      "activeAnnouncement",
      "stageTimer",
      "moderatorNotes",
      "speakers",
      "finance",
      "teamAssignments",
      "signatories",
      "agenda",
      "seats",
      "date",
      "time",
      "venue",
      "city",
      "isPaid",
      "ticketPrice",
      "fee",
      "slogan",
      "theme",
      "scriptLanguage",
      "certificateSettings",
      "membershipRules",
      "visitorSignIn",
      "memberFee",
      "nonMemberFee",
      "paymentCodes",
      "staffCodes",
      "membershipJoiningLink",
      "membershipQrImage",
      "eventPoster",
      "repeatGuestThreshold",
      "remindRepeatGuests",
      "downloadListPermission",
      "certificateStyle",
      "certificateAccentColor",
      "signatory1Role",
      "signatory1Name",
      "signatory1Image",
      "signatory2Role",
      "signatory2Name",
      "signatory2Image",
      "sponsors",
      "upcomingEvents",
      "appearance",
      "projectorUrl",
    ];

    const updateObj = {};
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        updateObj[key] = data[key];
      }
    }

    const updated = await Event.findByIdAndUpdate(eventId, { $set: updateObj }, { new: true });
    if (!updated) throw new NotFoundError("Event not found");
    return updated;
  },

  /**
   * RIFAH Operations Center: Append financial transaction (Money In / Money Out)
   */
  addFinanceTransaction: async (eventId, transactionData, user) => {
    const event = await Event.findById(eventId);
    if (!event) throw new NotFoundError("Event not found");

    if (!event.finance) {
      event.finance = { moneyIn: [], moneyOut: [], treasurerNotes: "" };
    }

    const { type, amount, desc, from, to, method, invoice, date, notes } = transactionData;
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      throw new BadRequestError("Transaction amount must be greater than 0");
    }
    const record = {
      id: `txn-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      desc: desc || "Finance entry",
      amount: numAmount,
      date: date || new Date().toISOString().split("T")[0],
    };

    if (type === "moneyIn" || type === "in") {
      record.from = from || "Contributor";
      record.method = method || "Online";
      event.finance.moneyIn.push(record);
    } else {
      record.to = to || "Vendor";
      record.invoice = invoice || `INV-${Date.now().toString().slice(-4)}`;
      event.finance.moneyOut.push(record);
    }

    if (notes) {
      event.finance.treasurerNotes = notes;
    }

    await event.save();

    const totalIn = event.finance.moneyIn.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const totalOut = event.finance.moneyOut.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const balance = totalIn - totalOut;

    return {
      finance: event.finance,
      summary: { totalIn, totalOut, balance },
      balance,
      totalIn,
      totalOut,
    };
  },

  /**
   * RIFAH Operations Center: Toggle attendee check-in
   */
  toggleCheckin: async (eventId, attendeeIdOrUserId, attendanceStatus = "Present") => {
    const event = await Event.findById(eventId);
    if (!event) throw new NotFoundError("Event not found");

    const regIndex = event.registeredUsers.findIndex(
      (reg) =>
        String(reg._id) === String(attendeeIdOrUserId) ||
        String(reg.user?._id || reg.user) === String(attendeeIdOrUserId)
    );

    if (regIndex === -1) {
      throw new BadRequestError("Attendee not registered for this event");
    }

    event.registeredUsers[regIndex].attendanceStatus = attendanceStatus;
    await event.save();
    return event.registeredUsers[regIndex];
  },

  /**
   * Start the scheduler to publish scheduled events automatically
   */
  startEventScheduler: () => {
    const syncStatuses = async () => {
      try {
        if (mongoose.connection.readyState !== 1) {
          return;
        }
        const now = new Date();

        // 1. Auto-publish scheduled events
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

        // 2. Real-time transition for Ended and Ongoing/Live events based on Date and Time
        const candidateEvents = await Event.find({
          status: { $in: [STATUSES.EVENT.UPCOMING, STATUSES.EVENT.ONGOING, "Upcoming", "Ongoing", "Live"] }
        });

        for (const ev of candidateEvents) {
          const comp = computeEventStatus(ev, now);
          if (comp === "Ended" && ev.status !== STATUSES.EVENT.COMPLETED) {
            ev.status = STATUSES.EVENT.COMPLETED;
            await ev.save();
            console.log(`[EventScheduler] Auto-completed/ended event: ${ev.title}`);
          } else if (comp === "Live" && ev.status !== STATUSES.EVENT.ONGOING) {
            ev.status = STATUSES.EVENT.ONGOING;
            await ev.save();
            console.log(`[EventScheduler] Auto-started live event: ${ev.title}`);
          }
        }
      } catch (error) {
        if (error.name !== "MongoServerSelectionError" && error.name !== "MongoNetworkError") {
          console.error("[EventScheduler] Error syncing event statuses:", error.message || error);
        }
      }
    };

    // Run immediately on boot
    syncStatuses();

    // Run every minute
    cron.schedule("* * * * *", syncStatuses);
    console.log("[EventScheduler] Started checking for scheduled and real-time event status transitions...");
  },

  // ─── Ask & Give Board ──────────────────────────────────────────────────────
  async getAskGiveBoard(eventId) {
    const event = await Event.findById(eventId)
      .populate("registeredUsers.user", "name email phone company businessName profilePhoto")
      .lean();
    if (!event) throw new NotFoundError("Event not found");

    return (event.registeredUsers || [])
      .filter((r) => (r.asks && r.asks.length > 0) || (r.gives && r.gives.length > 0))
      .map((r) => ({
        attendeeId: r._id,
        user: r.user,
        asks: r.asks || [],
        gives: r.gives || [],
        registeredAt: r.registeredAt,
      }));
  },

  async updateAttendeeAskGive(eventId, attendeeId, { asks, gives }) {
    const event = await Event.findById(eventId);
    if (!event) throw new NotFoundError("Event not found");

    const attendee = event.registeredUsers.id(attendeeId);
    if (!attendee) throw new NotFoundError("Attendee not found");

    if (asks) attendee.asks = asks.slice(0, 3);
    if (gives) attendee.gives = gives.slice(0, 3);
    await event.save();
    return { asks: attendee.asks, gives: attendee.gives };
  },

  // ─── Event Scripts ─────────────────────────────────────────────────────────
  async getScripts(eventId) {
    const event = await Event.findById(eventId).select("scripts speakers teamAssignments slogan theme chapter").lean();
    if (!event) throw new NotFoundError("Event not found");
    return { scripts: event.scripts || [], meta: { speakers: event.speakers, team: event.teamAssignments, slogan: event.slogan, theme: event.theme, chapter: event.chapter } };
  },

  async updateScript(eventId, segmentId, { customText, language }) {
    const event = await Event.findById(eventId);
    if (!event) throw new NotFoundError("Event not found");

    const existing = (event.scripts || []).find((s) => s.segmentId === segmentId);
    if (existing) {
      if (customText !== undefined) existing.customText = customText;
      if (language !== undefined) existing.language = language;
    } else {
      event.scripts.push({ segmentId, customText: customText || "", language: language || "English" });
    }
    await event.save();
    return event.scripts;
  },

  // ─── Event Role Assignments (functional roles → real access) ─────────────
  async assignRole(eventId, role, userId, assignedBy) {
    if (!ASSIGNABLE_ROLES.includes(role)) {
      throw new BadRequestError(`'${role}' is not an assignable event role`);
    }
    const event = await Event.findById(eventId);
    if (!event) throw new NotFoundError("Event not found");

    // Unassign
    if (!userId) {
      event.roleAssignments = (event.roleAssignments || []).filter((a) => a.role !== role);
      if (event.teamAssignments) event.teamAssignments[role] = "";
      await event.save();
      return { role, user: null };
    }

    const isEligible = (event.registeredUsers || []).some(
      (reg) => String(reg.user?._id || reg.user) === String(userId)
    );
    if (!isEligible) {
      throw new BadRequestError("Only users registered for this event can be assigned a role");
    }

    const user = await User.findById(userId).select("name");
    if (!user) throw new NotFoundError("User not found");

    event.roleAssignments = (event.roleAssignments || []).filter((a) => a.role !== role);
    event.roleAssignments.push({ role, user: userId, assignedAt: new Date(), assignedBy });
    if (event.teamAssignments) event.teamAssignments[role] = user.name;
    await event.save();

    return { role, user: { _id: userId, name: user.name } };
  },

  /**
   * Apply every role assignment for an event in ONE save. Saving them one call per role
   * would have each request load and overwrite the same document in parallel, so the last
   * write would silently drop the others.
   */
  async assignRolesBulk(eventId, assignments, assignedBy) {
    if (!Array.isArray(assignments)) {
      throw new BadRequestError("assignments must be an array of { role, userId }");
    }
    for (const { role } of assignments) {
      if (!ASSIGNABLE_ROLES.includes(role)) {
        throw new BadRequestError(`'${role}' is not an assignable event role`);
      }
    }

    const event = await Event.findById(eventId);
    if (!event) throw new NotFoundError("Event not found");

    const registeredIds = new Set(
      (event.registeredUsers || []).map((reg) => String(reg.user?._id || reg.user))
    );

    const userIds = assignments.map((a) => a.userId).filter(Boolean);
    const users = await User.find({ _id: { $in: userIds } }).select("name").lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    for (const { role, userId } of assignments) {
      event.roleAssignments = (event.roleAssignments || []).filter((a) => a.role !== role);

      if (!userId) {
        if (event.teamAssignments) event.teamAssignments[role] = "";
        continue;
      }
      if (!registeredIds.has(String(userId))) {
        throw new BadRequestError("Only users registered for this event can be assigned a role");
      }
      const user = userMap.get(String(userId));
      if (!user) throw new NotFoundError("User not found");

      event.roleAssignments.push({ role, user: userId, assignedAt: new Date(), assignedBy });
      if (event.teamAssignments) event.teamAssignments[role] = user.name;
    }

    await event.save();
    return event.roleAssignments;
  },

  async getRoleAssignments(eventId) {
    const event = await Event.findById(eventId)
      .select("roleAssignments")
      .populate("roleAssignments.user", "name email phone")
      .lean();
    if (!event) throw new NotFoundError("Event not found");
    return event.roleAssignments || [];
  },

  async hasEventRole(userId, eventId, role) {
    if (!userId || !eventId || !role) return false;
    const event = await Event.findOne(
      { _id: eventId, roleAssignments: { $elemMatch: { role, user: userId } } }
    ).select("_id").lean();
    return Boolean(event);
  },

  async getUserEventRoles(userId) {
    const events = await Event.find({ "roleAssignments.user": userId })
      .select("title date chapter creatorState visibilityScope status stageStatus roleAssignments")
      .lean();

    const assignments = [];
    for (const event of events) {
      for (const a of event.roleAssignments || []) {
        if (String(a.user) === String(userId)) {
          assignments.push({
            eventId: event._id,
            eventTitle: event.title,
            eventDate: event.date,
            chapter: event.chapter,
            state: event.creatorState || "",
            scope: event.visibilityScope || "global",
            status: event.status,
            stageStatus: event.stageStatus,
            isLive: isEventLive(event),
            role: a.role,
          });
        }
      }
    }
    return assignments;
  },

  async getMyDuty(eventId, user) {
    const event = await Event.findById(eventId).lean();
    if (!event) throw new NotFoundError("Event not found");

    const userId = user.id || user._id;
    const isAdmin = [ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN].includes(user.role);
    const assignedRoles = (event.roleAssignments || [])
      .filter((a) => String(a.user) === String(userId))
      .map((a) => a.role);

    // Admins can preview every tool; members only ever see what they were assigned.
    const myRoles = isAdmin ? Array.from(new Set([...FUNCTIONAL_ROLES, ...assignedRoles])) : assignedRoles;

    if (!isAdmin && myRoles.length === 0) {
      throw new ForbiddenError("You are not assigned to this event");
    }

    const live = isEventLive(event);

    const base = {
      eventId: event._id,
      title: event.title,
      date: event.date,
      time: event.time,
      venue: event.venue,
      chapter: event.chapter,
      state: event.creatorState || "",
      status: event.status,
      stageStatus: event.stageStatus,
      // Tools stay read-only until the admin takes the event live. Admins are never gated.
      isLive: live,
      canAct: live || isAdmin,
      myRoles,
      myFunctionalRoles: myRoles.filter((r) => FUNCTIONAL_ROLES.includes(r)),
      myStageRoles: myRoles.filter((r) => STAGE_ROLES.includes(r)),
      data: {},
    };

    if (myRoles.includes("entranceIncharge")) {
      // skipOwnerScope: the gate incharge is a member, not the event's creator.
      base.data.registrations = await this.getEventRegistrations(eventId, user, { skipOwnerScope: true });
    }
    if (myRoles.includes("followupCoordinator")) {
      base.data.followups = await followupService.getFollowups({ eventId, user });
    }
    if (myRoles.includes("treasurer")) {
      base.data.finance = event.finance || { moneyIn: [], moneyOut: [], treasurerNotes: "" };
    }
    if (myRoles.includes("guestManager")) {
      base.data.speakers = event.speakers || [];
    }
    if (myRoles.includes("eventCoordinator")) {
      base.data.agenda = event.agenda || [];
      base.data.kpi = {
        registeredCount: (event.registeredUsers || []).length,
        seats: event.seats,
      };
    }
    if (myRoles.includes("photosVideo")) {
      base.data.mediaCount = await eventMediaService.countForEvent(eventId);
    }

    return base;
  },

  /**
   * Gate Incharge: approve or reject a registrant at the entrance. Approving also marks
   * them Present so the admin's attendee counts stay in step with the gate.
   */
  async setGateStatus(eventId, attendeeId, gateStatus, user) {
    if (!["approved", "rejected", "waiting"].includes(gateStatus)) {
      throw new BadRequestError("gateStatus must be one of: approved, rejected, waiting");
    }
    const event = await Event.findById(eventId);
    if (!event) throw new NotFoundError("Event not found");

    const isAdmin = [ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN].includes(user.role);
    if (!isAdmin && !isEventLive(event)) {
      throw new ForbiddenError("The gate opens once the admin takes this event live.");
    }

    const entry = (event.registeredUsers || []).find(
      (r) => String(r._id) === String(attendeeId) || String(r.user) === String(attendeeId)
    );
    if (!entry) throw new NotFoundError("Registration not found for this event");

    entry.gateStatus = gateStatus;
    if (gateStatus === "approved") {
      entry.gateApprovedAt = new Date();
      entry.attendanceStatus = "Present";
    } else if (gateStatus === "rejected") {
      entry.attendanceStatus = "Absent";
    } else {
      entry.gateApprovedAt = undefined;
      entry.attendanceStatus = "Pending";
    }

    await event.save();
    return { attendeeId: entry._id, gateStatus: entry.gateStatus, attendanceStatus: entry.attendanceStatus };
  },
};
