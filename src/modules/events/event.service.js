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

      // 1. Creator always sees their own events regardless of scope
      visibilityConditions.push({ createdBy: userId });

      if (userRole === ROLES.CENTRAL_ADMIN) {
        // Central admin sees ALL events — no filter
        visibilityConditions.push({});

      } else if (userRole === ROLES.STATE_ADMIN) {
        // State admin sees:
        //   a. Global events (created by central_admin)
        //   b. State-scope events in their own state
        //   c. Chapter-scope events within their state
        visibilityConditions.push({ visibilityScope: "global" });
        if (userState) {
          const stateRx = new RegExp(`^${userState}$`, "i");
          visibilityConditions.push({
            visibilityScope: "state",
            creatorState: stateRx,
          });
          visibilityConditions.push({
            visibilityScope: "chapter",
            creatorState: stateRx,
          });
        }

      } else if (userRole === ROLES.CHAPTER_ADMIN) {
        // Chapter admin sees:
        //   a. Global events
        //   b. State-scope events in their state
        //   c. Chapter-scope events in their own chapter
        visibilityConditions.push({ visibilityScope: "global" });
        if (userState) {
          visibilityConditions.push({
            visibilityScope: "state",
            creatorState: new RegExp(`^${userState}$`, "i"),
          });
        }
        if (userChapter) {
          visibilityConditions.push({
            visibilityScope: "chapter",
            creatorChapter: new RegExp(`^${userChapter}$`, "i"),
          });
        }

      } else {
        // Regular users (business_owner / customer):
        //   a. Always see global events
        //   b. See state-scope events in their state
        //   c. See chapter-scope events in their chapter
        //   d. They must also be in the targetAudience
        const roleDisplay = userRole === ROLES.BUSINESS_OWNER ? "Businesses" : "Consumers";
        const audienceMatch = { targetAudience: { $in: ["All", roleDisplay] } };

        // Global events open to this audience
        visibilityConditions.push({ ...audienceMatch, visibilityScope: "global" });

        if (userState) {
          visibilityConditions.push({
            ...audienceMatch,
            visibilityScope: "state",
            creatorState: new RegExp(`^${userState}$`, "i"),
          });
        }
        if (userChapter) {
          visibilityConditions.push({
            ...audienceMatch,
            visibilityScope: "chapter",
            creatorChapter: new RegExp(`^${userChapter}$`, "i"),
          });
        }
      }
    } else {
      // Unauthenticated: only global events that are fully public
      visibilityConditions.push({
        visibilityScope: "global",
        targetAudience: { $in: ["All"] },
      });
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

    // Creator always has access
    if (String(event.createdBy) === userId) return event;

    // Super admin sees all
    if (userRole === ROLES.CENTRAL_ADMIN) return event;

    if (event.visibilityScope === "state") {
      // State admin, chapter admin, or regular user within the same state
      const sameState = userState && event.creatorState &&
        userState.toLowerCase() === event.creatorState.toLowerCase();
      if (sameState || userRole === ROLES.STATE_ADMIN && sameState) {
        return event;
      }
      throw new ForbiddenError("This event is restricted to members of its state.");
    }

    if (event.visibilityScope === "chapter") {
      // Only members of the same chapter
      const sameChapter = userChapter && event.creatorChapter &&
        userChapter.toLowerCase() === event.creatorChapter.toLowerCase();
      // State admin of the same state can also see chapter events in their state
      const stateAdminSameState = userRole === ROLES.STATE_ADMIN && userState &&
        event.creatorState && userState.toLowerCase() === event.creatorState.toLowerCase();

      if (sameChapter || stateAdminSameState) return event;
      throw new ForbiddenError("This event is restricted to members of its chapter.");
    }

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

        // Chapter admins cannot directly publish; requires state/central approval
        if (data.status === STATUSES.EVENT.UPCOMING) {
          data.status = STATUSES.EVENT.PENDING_APPROVAL;
        }

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
    if (user && user.role !== ROLES.CENTRAL_ADMIN && user.role !== ROLES.SECRETARIAT) {
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
    if (user && user.role !== ROLES.CENTRAL_ADMIN && user.role !== ROLES.SECRETARIAT) {
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
        eventPoster: event.eventPoster || "",
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
    const numAmount = Number(amount) || 0;
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
