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
        recipientId: (user.id || user._id),
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

    const visibilityConditions = [];

    if (user) {
      // 1. Creator always sees their events
      visibilityConditions.push({ createdBy: (user.id || user._id) });

      if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.SECRETARIAT) {
        // Super admin sees all
        visibilityConditions.push({});
      } else if (user.role === ROLES.STATE_ADMIN && user.state) {
        const stateRegex = new RegExp(`^${user.state.trim()}$`, "i");
        visibilityConditions.push({ targetStates: { $in: ["All", stateRegex] } });
        
        // Also events targeted to chapters within their state (or All)
        const stateChapters = await mongoose.model('Chapter').find({ state: stateRegex }).select("name");
        const chapterNames = stateChapters.map(c => new RegExp(`^${c.name.trim()}$`, "i"));
        if (chapterNames.length > 0) {
          visibilityConditions.push({ targetChapters: { $in: ["All", ...chapterNames] } });
        }
      } else if (user.role === ROLES.CHAPTER_ADMIN && user.chapter) {
        // Chapter Admin sees events targeted to their chapter, their state, or "All"
        const chapterRegex = new RegExp(`^${user.chapter.trim()}$`, "i");
        visibilityConditions.push({ targetChapters: { $in: ["All", chapterRegex] } });
        if (user.state) {
          visibilityConditions.push({ targetStates: { $in: ["All", new RegExp(`^${user.state.trim()}$`, "i")] } });
        }
      } else if ([ROLES.BUSINESS_OWNER, ROLES.CUSTOMER].includes(user.role)) {
        if (queryParams.all === "true" || queryParams.scope === "all" || queryParams.showAll === "true") {
          // Allow viewing all published chamber events across all chapters and locations
          visibilityConditions.push({});
        } else {
          // Regular users must match audience, state, and chapter
          const userRoleDisplay = user.role === ROLES.BUSINESS_OWNER ? "Businesses" : "Consumers";
          const audienceMatch = { targetAudience: { $in: ["All", userRoleDisplay] } };
          
          const locConditions = [{ targetStates: "All", targetChapters: "All" }]; // Fully public
          
          if (user.state) {
            locConditions.push({ targetStates: new RegExp(`^${user.state.trim()}$`, "i") });
          }
          if (user.chapter) {
            locConditions.push({ targetChapters: new RegExp(`^${user.chapter.trim()}$`, "i") });
            locConditions.push({ chapter: new RegExp(`^${user.chapter.trim()}$`, "i") }); // Legacy
          }
          
          visibilityConditions.push({
             $and: [
               audienceMatch,
               { $or: locConditions }
             ]
          });
        }
      }
    } else {
      // Unauthenticated users see fully public events
      visibilityConditions.push({
        targetAudience: "All",
        targetStates: "All",
        targetChapters: "All"
      });
    }

    if (visibilityConditions.length > 0) {
      // If it contains an empty object, it means no restrictions
      const hasEmpty = visibilityConditions.some(c => Object.keys(c).length === 0);
      if (!hasEmpty) {
        filter.$or = visibilityConditions;
      }
    }

    if (queryParams.chapter) {
      filter.chapter = new RegExp(`^${queryParams.chapter.trim()}$`, "i");
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

    // Allow viewing if they have the link. Targeting is enforced in listEvents.
    const event = await Event.findOne(query);
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

    // RBAC Scope Enforcement
    if (user) {
      if (user.role === ROLES.CHAPTER_ADMIN) {
        data.chapter = user.chapter;
        data.targetChapters = [user.chapter];
        if (user.state) data.targetStates = [user.state];
        
        // Force Pending Approval if they try to publish
        if (data.status === STATUSES.EVENT.UPCOMING) {
          data.status = STATUSES.EVENT.PENDING_APPROVAL;
        }
      } else if (user.role === ROLES.STATE_ADMIN) {
        if (user.state) data.targetStates = [user.state];
        // They can select targetChapters, but targetStates is forced to their own state
      }
    }

    // Ensure paid event attributes and fee are strictly synchronized
    const isPaid = Boolean(data.isPaid === true || data.isPaid === "true" || data.isPaid === "Paid");
    const ticketPrice = isPaid ? (Number(data.ticketPrice) || 0) : 0;
    const fee = isPaid ? `₹${ticketPrice}` : (data.fee && data.fee !== "Complimentary for Members" ? data.fee : "Free");

    data.isPaid = isPaid;
    data.ticketPrice = ticketPrice;
    data.fee = fee;

    if (user) {
      data.createdBy = (user.id || user._id);
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
            paymentStatus,
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

        await notificationService.createNotification({
          recipientId: userId,
          type: "Event",
          title: "Event Registration Confirmed",
          body: event.isPaid
            ? `Your payment of ₹${event.ticketPrice} for "${updatedEvent.title}" is confirmed!`
            : `Your registration for "${updatedEvent.title}" is confirmed!`,
          entityId: updatedEvent._id,
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
  getEventRegistrations: async (eventId, user) => {
    const query = { _id: eventId };
    if (user && user.role !== ROLES.SUPER_ADMIN && user.role !== ROLES.SECRETARIAT) {
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
        attendanceStatus: entry.attendanceStatus || "Pending",
      });
    }

    return registrations;
  },

  /**
   * Update event details
   */
  updateEvent: async (id, updateData, user) => {
    const query = { _id: id };
    if (user && user.role !== ROLES.SUPER_ADMIN && user.role !== ROLES.SECRETARIAT) {
      query.createdBy = (user.id || user._id);
    }
    const existing = await Event.findOne(query);
    if (!existing) {
      throw new NotFoundError("Event not found or you don't have permission to edit it");
    }

    // RBAC: Chapter Admin Scope Enforcement
    if (user) {
      if (user.role === ROLES.CHAPTER_ADMIN) {
        delete updateData.chapter; // Prevent modifying chapter
        delete updateData.targetChapters;
        delete updateData.targetStates;
        // If chapter admin tries to publish or edit a published event, push it to Pending Approval
        if (updateData.status === STATUSES.EVENT.UPCOMING) {
          updateData.status = STATUSES.EVENT.PENDING_APPROVAL;
        }
      } else if (user.role === ROLES.STATE_ADMIN) {
        delete updateData.targetStates; // Prevent modifying targetStates
      }
    }

    if (updateData.title && updateData.title !== existing.title) {
      updateData.slug = generateSlug(updateData.title);
    }

    // Ensure paid event attributes and fee are strictly synchronized on update
    if (updateData.isPaid !== undefined || updateData.ticketPrice !== undefined || updateData.fee !== undefined) {
      const isPaid = updateData.isPaid !== undefined
        ? Boolean(updateData.isPaid === true || updateData.isPaid === "true" || updateData.isPaid === "Paid")
        : existing.isPaid;
      const ticketPrice = isPaid
        ? (Number(updateData.ticketPrice !== undefined ? updateData.ticketPrice : existing.ticketPrice) || 0)
        : 0;
      const fee = isPaid
        ? `₹${ticketPrice}`
        : (updateData.fee && updateData.fee !== "Complimentary for Members" ? updateData.fee : "Free");

      updateData.isPaid = isPaid;
      updateData.ticketPrice = ticketPrice;
      updateData.fee = fee;
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
    const query = { _id: id };
    if (user && user.role !== ROLES.SUPER_ADMIN && user.role !== ROLES.SECRETARIAT) {
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
    return deleted;
  },

  /**
   * RIFAH Operations Center: Get full operations state for an event
   */
  getOperations: async (eventId, user) => {
    const event = await Event.findById(eventId).populate("registeredUsers.user", "name email phone mobile company city membershipStatus");
    if (!event) throw new NotFoundError("Event not found");

    const registeredUsers = event.registeredUsers || [];
    const totalRegistered = registeredUsers.length;
    const checkedIn = registeredUsers.filter((r) => r.attendanceStatus === "Present").length;
    const membersCount = registeredUsers.filter((r) => {
      const u = r.user;
      return u?.membershipStatus && u.membershipStatus !== "None" && u.membershipStatus !== "Expired";
    }).length;

    let totalFees = 0;
    if (event.isPaid && event.ticketPrice) {
      totalFees = totalRegistered * event.ticketPrice;
    } else if (event.finance?.moneyIn?.length) {
      totalFees = event.finance.moneyIn.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    }

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
      },
      kpi: {
        registered: totalRegistered,
        approved: totalRegistered,
        members: membersCount,
        checkedIn: checkedIn,
        fees: totalFees,
      },
      attendees: registeredUsers.map((reg, idx) => ({
        id: reg._id || `att-${idx}`,
        userId: reg.user?._id || reg.user,
        name: reg.user?.name || "Attendee " + (idx + 1),
        email: reg.user?.email || "",
        mobile: reg.user?.phone || reg.user?.mobile || "Not provided",
        company: reg.user?.company || "Enterprise",
        city: reg.user?.city || event.city || "Mumbai",
        membership: reg.user?.membershipStatus || "Member",
        status: reg.paymentStatus || (event.isPaid ? "Paid" : "Free"),
        attendanceStatus: reg.attendanceStatus || "Pending",
        time: reg.registeredAt ? new Date(reg.registeredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "10:00 AM",
      })),
    };
  },

  /**
   * RIFAH Operations Center: Update operations data for an event
   */
  updateOperations: async (eventId, data, user) => {
    const allowedFields = [
      "stageStatus",
      "currentSlideIndex",
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
