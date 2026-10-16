import mongoose from "mongoose";
import crypto from "crypto";
import cron from "node-cron";
import { Event } from "./event.model.js";
import { User } from "../users/user.model.js";
import { env } from "../../config/env.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { whatsappService } from "../../infrastructure/whatsapp/whatsapp.service.js";
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
import { isValidEmail, isValidPhone, isValidName } from "../../shared/validators/common.validation.js";
import { revenueShareService } from "../revenue-sharing/revenueShare.service.js";
import { logger } from "../../infrastructure/logger/logger.js";

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

const broadcastEventToAudience = (event) => {
  if (event.status !== STATUSES.EVENT.UPCOMING) {
    return;
  }

  // Fire-and-forget: send emails + notifications without blocking response
  setImmediate(async () => {
    try {
      let rolesToTarget = [];
      const targetArray = event.targetAudience || [];
      const isAll = targetArray.length === 0 || targetArray.some(a => a.toLowerCase() === "all");

      if (isAll) {
        rolesToTarget = [ROLES.CUSTOMER, ROLES.BUSINESS_OWNER, ROLES.CHAPTER_ADMIN, ROLES.STATE_ADMIN, ROLES.CENTRAL_ADMIN];
      } else {
        if (targetArray.includes("Consumers")) rolesToTarget.push(ROLES.CUSTOMER);
        if (targetArray.includes("Businesses")) rolesToTarget.push(ROLES.BUSINESS_OWNER);
        if (targetArray.includes("Chapter Admins")) rolesToTarget.push(ROLES.CHAPTER_ADMIN);
        if (targetArray.includes("State Admins")) rolesToTarget.push(ROLES.STATE_ADMIN);
      }

      if (rolesToTarget.length === 0) return;

      const userFilter = { role: { $in: rolesToTarget }, status: STATUSES.USER.ACTIVE };
      if (event.countryId) {
        userFilter.countryId = event.countryId;
      } else if (event.country) {
        userFilter.country = new RegExp(`^${event.country}$`, "i");
      }

      const users = await User.find(userFilter);

      // Send notifications and emails concurrently for instant delivery
      await Promise.allSettled(
        users.map(async (user) => {
          try {
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
                mode: event.mode || "Offline",
              });
            }
          } catch (innerErr) {
            console.error(`Failed to broadcast to user ${user.email}:`, innerErr);
          }
        })
      );
    } catch (err) {
      console.error("Error broadcasting event to audience:", err);
    }
  });
};

// Same creator-scope RBAC as listEvents' strictAdminScope branch: a state/chapter
// admin can manage (edit/delete/view registrations for) any event visible to them
// in the admin dashboard, not just ones they personally created (RIF-038/RIF-039 —
// listEvents already gave them that visibility; update/delete/registrations never did).
const buildManageScopeQuery = (id, user) => {
  if (!user || user.role === ROLES.CENTRAL_ADMIN) return { _id: id };
  const conditions = [{ createdBy: user.id || user._id }];
  const userCountry = (user.country || "").trim();
  const userCountryId = user.countryId;
  const userState = (user.state || "").trim();
  const userChapter = (user.chapter || "").trim();

  if (user.role === ROLES.COUNTRY_ADMIN) {
    if (userCountryId) conditions.push({ countryId: userCountryId });
    if (userCountry) {
      conditions.push({ country: new RegExp(`^${userCountry}$`, "i") });
      conditions.push({ targetCountries: new RegExp(`^${userCountry}$`, "i") });
    }
  } else if (user.role === ROLES.STATE_ADMIN && userState) {
    conditions.push({ creatorState: new RegExp(`^${userState}$`, "i") });
    conditions.push({ state: new RegExp(`^${userState}$`, "i") });
    conditions.push({ targetStates: new RegExp(`^${userState}$`, "i") });
  } else if (user.role === ROLES.CHAPTER_ADMIN && userChapter) {
    conditions.push({ creatorChapter: new RegExp(`^${userChapter}$`, "i") });
    conditions.push({ chapter: new RegExp(`^${userChapter}$`, "i") });
    conditions.push({ targetChapters: new RegExp(`^${userChapter}$`, "i") });
  }
  return { _id: id, $or: conditions };
};

/**
 * Resolves an Event and attendee registration by ticket ID or registration _id,
 * with backward-compatibility for legacy fallback QR codes (RIFAH-EVT-YYYY-XXXX).
 */
const resolveEventAndRegistration = async (ticketId, populateFields = "name email phone company businessName chapter state profilePhoto") => {
  if (!ticketId || typeof ticketId !== "string") {
    return { event: null, reg: null, cleanTicketId: "" };
  }

  let cleanTicketId = ticketId.trim();
  try {
    cleanTicketId = decodeURIComponent(cleanTicketId).trim();
  } catch (_) {}

  // Strip URL prefix if scanner sent full URL or route path
  if (cleanTicketId.includes("/verify/ticket/")) {
    const parts = cleanTicketId.split("/verify/ticket/");
    if (parts.length > 1) {
      cleanTicketId = parts[1].trim();
    }
  }

  // Strip query string if any (?token=...)
  if (cleanTicketId.includes("?")) {
    cleanTicketId = cleanTicketId.split("?")[0].trim();
  }

  // Strip leading and trailing slashes
  cleanTicketId = cleanTicketId.replace(/^\/+|\/+$/g, "").trim();

  // Escape special regex characters
  const escapedTicketId = cleanTicketId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // 1. Direct match by ticketId, registration _id, or user ID
  let query = Event.findOne({
    $or: [
      { "registeredUsers.ticketId": { $regex: new RegExp(`^${escapedTicketId}$`, "i") } },
      ...(cleanTicketId.match(/^[0-9a-fA-F]{24}$/)
        ? [
            { "registeredUsers._id": cleanTicketId },
            { "registeredUsers.user": cleanTicketId },
          ]
        : []),
    ],
  });

  if (populateFields) {
    query = query.populate("registeredUsers.user", populateFields);
  }

  let event = await query;
  let reg = event
    ? (event.registeredUsers || []).find(
        (r) =>
          (r.ticketId && r.ticketId.toLowerCase() === cleanTicketId.toLowerCase()) ||
          String(r._id) === cleanTicketId ||
          String(r.user?._id || r.user) === cleanTicketId
      )
    : null;

  // 2. Backward compatibility for legacy fallback QR codes: RIFAH-EVT-YYYY-XXXX (where XXXX is last 4-6 chars)
  if (!reg) {
    const legacyMatch = cleanTicketId.match(/^RIFAH-EVT-\d{4}-([0-9a-fA-F]{4,6})$/i);
    if (legacyMatch) {
      const eventSuffix = legacyMatch[1].toLowerCase();
      let candidateQuery = Event.find({}).sort({ createdAt: -1 });
      if (populateFields) {
        candidateQuery = candidateQuery.populate("registeredUsers.user", populateFields);
      }
      const candidateEvents = await candidateQuery;
      let matchedEvent = null;
      let matchedReg = null;

      for (const e of candidateEvents) {
        if (!e.registeredUsers || e.registeredUsers.length === 0) continue;
        const found = e.registeredUsers.find(
          (r) => r.ticketId && r.ticketId.toLowerCase().endsWith(eventSuffix)
        );
        if (found) {
          matchedEvent = e;
          matchedReg = found;
          break;
        }
      }

      if (!matchedEvent) {
        matchedEvent = candidateEvents.find((e) =>
          String(e._id).toLowerCase().endsWith(eventSuffix)
        );
        if (matchedEvent && matchedEvent.registeredUsers && matchedEvent.registeredUsers.length > 0) {
          const uncheckedReg = [...matchedEvent.registeredUsers]
            .reverse()
            .find((r) => !r.checkedIn && r.attendanceStatus !== "Present");

          matchedReg = uncheckedReg || matchedEvent.registeredUsers[matchedEvent.registeredUsers.length - 1];

          if (matchedReg) {
            matchedReg.ticketId = cleanTicketId;
            await matchedEvent.save();
          }
        }
      }

      if (matchedEvent && matchedReg) {
        event = matchedEvent;
        reg = matchedReg;
      }
    }
  }

  return { event, reg, cleanTicketId };
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

      } else if (userRole === ROLES.COUNTRY_ADMIN) {
        // Country Admin: strictly isolated to events within their country tenant
        const userCountry = (user.country || "").trim();
        const userCountryId = user.countryId;
        if (userCountryId) visibilityConditions.push({ countryId: userCountryId });
        if (userCountry) {
          visibilityConditions.push({ country: new RegExp(`^${userCountry}$`, "i") });
          visibilityConditions.push({ targetCountries: new RegExp(`^${userCountry}$`, "i") });
        }

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
          // Admin Dashboard: see chapter events or national/global events
          if (userChapter) {
            visibilityConditions.push({ creatorChapter: new RegExp(`^${userChapter}$`, "i") });
            visibilityConditions.push({ chapter: new RegExp(`^${userChapter}$`, "i") });
            visibilityConditions.push({ chapter: "Global" });
            visibilityConditions.push({ chapter: /all chapters/i });
          } else {
            visibilityConditions.push({});
          }
        } else {
          // Public browsing: see all events globally
          visibilityConditions.push({});
        }

      } else if (
        userRole === "guest_speaker_manager" ||
        userRole === "guestManager" ||
        userRole === "event_coordinator" ||
        userRole === "eventCoordinator"
      ) {
        if (queryParams.strictAdminScope === "true" || queryParams.strictAdminScope === true) {
          if (userChapter) {
            visibilityConditions.push({ creatorChapter: new RegExp(`^${userChapter}$`, "i") });
            visibilityConditions.push({ chapter: new RegExp(`^${userChapter}$`, "i") });
            visibilityConditions.push({ chapter: "Global" });
            visibilityConditions.push({ chapter: /all chapters/i });
          } else {
            visibilityConditions.push({});
          }
          const userId = user.id || user._id;
          if (userId) {
            visibilityConditions.push({ "roleAssignments.user": userId });
          }
        } else {
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
    if (queryParams.country) {
      const cRegex = new RegExp(`^${queryParams.country.trim()}$`, "i");
      const cFilter = {
        $or: [
          { country: cRegex },
          { targetCountries: cRegex }
        ]
      };
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, cFilter];
        delete filter.$or;
      } else {
        filter.$or = cFilter.$or;
      }
    }
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

    const event = await Event.findOne(query).populate("registeredUsers.user", "name email phone businessName company");
    if (!event) throw new NotFoundError("Event not found");

    // Ensure all registered users have a ticketId and verificationToken
    if (event && Array.isArray(event.registeredUsers)) {
      let needsSave = false;
      for (const reg of event.registeredUsers) {
        if (!reg.ticketId) {
          reg.ticketId = `RIFAH-EVT-${new Date().getFullYear()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
          needsSave = true;
        }
        if (!reg.verificationToken) {
          reg.verificationToken = crypto.randomBytes(24).toString("hex");
          needsSave = true;
        }
      }
      if (needsSave) {
        await event.save();
      }
    }

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
      data.country        = (user.country || data.country || "").trim();
      data.countryId      = user.countryId || data.countryId;

      if (user.role === ROLES.COUNTRY_ADMIN) {
        data.visibilityScope = "country";
        data.country = (user.country || data.country || "").trim();
        data.countryId = user.countryId || data.countryId;
        if (data.country) {
          data.targetCountries = [data.country];
        }
      } else if (user.role === ROLES.CHAPTER_ADMIN) {
        // Chapter admin events: visible only within their chapter
        data.visibilityScope = "chapter";
        data.chapter         = (user.chapter || data.chapter || "").trim();
        data.targetChapters  = [data.chapter];
        if (user.state) data.targetStates = [user.state];

        // Ensure city is correctly set to chapter admin's city instead of default
        if (!data.city || data.city === "All Cities" || data.city === "Mumbai") {
          const derivedCity = user.city || (user.chapter ? user.chapter.replace(/\s*[Cc]hapter\s*/gi, "").trim() : "");
          if (derivedCity) {
            data.city = derivedCity;
          }
        }

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

    // ── Delegation Event Central Admin Check & Installments ──
    const isDelegation = data.eventCategory === "Delegation" || Boolean(data.isDelegation);
    if (isDelegation) {
      const isCentralAdmin = user && ["central_admin", "super_admin", "admin", "secretariat"].includes(user.role);
      if (!isCentralAdmin) {
        throw new ForbiddenError("Only Central Admin has the option to create or manage a Delegation Event");
      }
      data.eventCategory = "Delegation";
      data.isDelegation = true;
      data.isPaid = true;

      if (Array.isArray(data.delegationInstallments) && data.delegationInstallments.length > 0) {
        data.delegationInstallments = data.delegationInstallments.map((inst, idx) => ({
          installmentNumber: Number(inst.installmentNumber) || idx + 1,
          title: (inst.title || `Installment ${idx + 1}`).trim(),
          dueDate: String(inst.dueDate || "").trim(),
          memberAmount: Number(inst.memberAmount) || 0,
          nonMemberAmount: Number(inst.nonMemberAmount) || 0,
          notes: inst.notes || "",
        }));

        const totalMember = data.delegationInstallments.reduce((acc, i) => acc + (Number(i.memberAmount) || 0), 0);
        const totalNonMember = data.delegationInstallments.reduce((acc, i) => acc + (Number(i.nonMemberAmount) || 0), 0);
        data.memberPrice = totalMember;
        data.ticketPrice = totalNonMember;
      }
    }

    // ── Sync paid event fields ────────────────────────────────────────────────
    const isPaid       = Boolean(data.isPaid === true || data.isPaid === "true" || data.isPaid === "Paid");
    const ticketPrice  = isPaid ? (Number(data.ticketPrice) || 0) : 0;
    const fee          = isPaid ? `₹${ticketPrice}` : (data.fee && data.fee !== "Complimentary for Members" ? data.fee : "Free");

    data.isPaid      = isPaid;
    data.ticketPrice = ticketPrice;
    data.fee         = fee;
    data.gstRate     = 18;

    const event = await Event.create({ ...data, slug });

    // Automatically create a post in the feed for this event
    try {
      await postService.syncEventPost(event, user);
    } catch (err) {
      console.error("Failed to auto-create feed post for event:", err);
    }

    if (event.status === STATUSES.EVENT.UPCOMING) {
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

    const user = await User.findById(userId);
    const isGuest = user && user.role === "customer";

    // Allow guests to register multiple times for the same event (e.g., buying for friends)
    if (isAlreadyRegistered && !isGuest) {
      throw new BadRequestError("You are already registered for this event");
    }

    if (event.isRegistrationClosed || event.seatsFull) {
      throw new BadRequestError("Registrations are closed / seats are full for this event");
    }

    if (event.registrationClosingDate && new Date() > new Date(event.registrationClosingDate)) {
      throw new BadRequestError("Registrations for this event have closed");
    }

    if (event.totalSeats > 0 && event.registeredCount >= event.totalSeats) {
      throw new BadRequestError("Event capacity has been reached");
    }

    const isDelegation = event.eventCategory === "Delegation" || Boolean(event.isDelegation);

    if (event.isPaid && !paymentData && !isDelegation) {
      throw new BadRequestError("Payment is required for this event");
    }

    if (event.registrationAccess && event.registrationAccess !== "All") {
      const access = event.registrationAccess;
      const BusinessModel = mongoose.model("Business");
      const business = await BusinessModel.findOne({ owner: userId });

      if (access === "Registered Businesses Only" && !business) {
        throw new BadRequestError("Only registered businesses can register for this event");
      }
      
      const isVerified = business && (business.verification === "verified" || business.verification === "Verified");
      if (access === "Paid Members Only" && !isVerified) {
        throw new BadRequestError("Only verified/paid members can register for this event");
      }
      
      const isAdminRole = user && ["chapter_admin", "state_admin", "central_admin"].includes(user.role);
      if (access === "Chapter Admins Only" && !isAdminRole) {
        throw new BadRequestError("Only Chapter Admins can register for this event");
      }
      
      const isStateAdminRole = user && ["state_admin", "central_admin"].includes(user.role);
      if (access === "State Secretaries Only" && !isStateAdminRole) {
        throw new BadRequestError("Only State Secretaries can register for this event");
      }
    }

    let attendeeRole = "guest";
    if (user && user.role !== "customer") {
      const BusinessModel = mongoose.model("Business");
      const business = await BusinessModel.findOne({ owner: userId });
      if (business) {
        if (business.verification === "verified" || business.verification === "Verified") {
          attendeeRole = "member";
        } else {
          attendeeRole = "non_member";
        }
      }
    }

    const amountPaid = Number(paymentData?.amount || 0);
    const baseAmount = Number(paymentData?.baseAmount || (amountPaid > 0 ? Math.round(amountPaid / 1.18) : 0));
    const gstAmount = Number(paymentData?.gstAmount || (amountPaid > 0 ? (amountPaid - baseAmount) : 0));

    const ticketId = `RIFAH-EVT-${new Date().getFullYear()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const verificationToken = crypto.randomBytes(24).toString("hex");
    const ticketType = event.isPaid ? (attendeeRole === "member" ? "Member Pass" : "General Pass") : "Member Pass";
    const frontendBaseUrl = env.FRONTEND_URL || "https://rifah.nexcorealliance.com";
    const verificationUrl = `${frontendBaseUrl}/verify/ticket/${ticketId}?token=${verificationToken}`;
    let paymentStatus = "Free";
    let paymentId = null;
    let initialAmountPaid = paymentData?.amount || 0;
    let userInstallments = [];

    if (isDelegation && Array.isArray(event.delegationInstallments) && event.delegationInstallments.length > 0) {
      userInstallments = event.delegationInstallments.map((inst) => {
        const baseAmount = attendeeRole === "member" ? Number(inst.memberAmount || 0) : Number(inst.nonMemberAmount || 0);
        const gstRate = 5;
        const gstAmount = Math.round((baseAmount * 0.05) * 100) / 100;
        const tcsRate = 2;
        const tcsAmount = Math.round((baseAmount * 0.02) * 100) / 100;
        const totalAmount = Math.round((baseAmount + gstAmount + tcsAmount) * 100) / 100;

        return {
          installmentNumber: inst.installmentNumber,
          title: inst.title,
          dueDate: inst.dueDate,
          baseAmount,
          gstRate,
          gstAmount,
          tcsRate,
          tcsAmount,
          totalAmount,
          status: "Pending",
          paymentId: null,
          invoiceNumber: null,
          paidAt: null,
          method: "",
          remindersSent: {
            prior1Day: { sent: false, sentAt: null },
            dueImmediate: { sent: false, sentAt: null },
            dailyOverdueCount: 0,
            lastOverdueSentAt: null,
          },
        };
      });

      if (paymentData && userInstallments.length > 0) {
        const inst1 = userInstallments[0];
        const { Payment } = await import("../payments/payment.model.js");
        const { getNextInvoiceNumber } = await import("../../shared/utils/sequence-generator.js");

        const invoiceNumber = await getNextInvoiceNumber({ chapter: event.chapter });

        const paymentDoc = await Payment.create({
          invoiceNumber,
          payer: userId,
          eventId: event._id,
          itemType: "Delegation Installment",
          description: `${event.title} - ${inst1.title} (Installment #${inst1.installmentNumber})`,
          subtotal: inst1.baseAmount,
          gstRate: 5,
          gstAmount: inst1.gstAmount,
          tcsRate: 2,
          tcsAmount: inst1.tcsAmount,
          amount: inst1.totalAmount,
          currency: "INR",
          method: paymentData.method || "Online Transfer",
          status: "Paid",
          transactionId: paymentData.transactionId || `TXN-DEL-${invoiceNumber}`,
          paidAt: new Date(),
          chapter: event.chapter || "Central",
          state: event.creatorState || "Central",
          isDelegationPayment: true,
          installmentNumber: inst1.installmentNumber,
          installmentTitle: inst1.title,
          payerName: user?.name || "Delegate",
          payerEmail: user?.email || "",
          payerPhone: user?.phone || "",
          notes: `Delegation Installment #${inst1.installmentNumber} (Base: ₹${inst1.baseAmount} + 5% GST: ₹${inst1.gstAmount} + 2% TCS: ₹${inst1.tcsAmount})`,
        });

        // Revenue Sharing: see payDelegationInstallment below for why this is non-fatal.
        try {
          await revenueShareService.createLedgerEntriesForPayment(paymentDoc, { event, actor: { id: userId } });
        } catch (revShareErr) {
          logger.error(`[REVENUE SHARE] Failed to create ledger entries for payment ${paymentDoc._id}:`, revShareErr);
        }

        inst1.status = "Paid";
        inst1.paymentId = String(paymentDoc._id);
        inst1.invoiceNumber = paymentDoc.invoiceNumber;
        inst1.paidAt = new Date();
        inst1.method = paymentDoc.method;

        paymentStatus = userInstallments.length === 1 ? "Paid" : "Partially Paid";
        paymentId = paymentDoc._id;
        initialAmountPaid = inst1.totalAmount;
      } else {
        paymentStatus = "Pending";
      }
    } else if (event.isPaid && paymentData) {
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
            role: attendeeRole,
            status: "Confirmed",
            paymentStatus: paymentStatus,
            amountPaid: amountPaid || initialAmountPaid,
            baseAmount: baseAmount,
            gstAmount: gstAmount,
            paymentId: paymentId,
            transactionId: paymentData?.transactionId,
            ticketId,
            ticketType,
            ticketStatus: "Confirmed",
            verificationToken,
            checkedIn: false,
            checkedInAt: null,
            checkedInBy: "",
            installments: userInstallments,
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
            ticketType,
            ticketId,
            verificationUrl,
            isPaid: event.isPaid,
            ticketPrice: event.ticketPrice,
            paymentId: paymentData?.paymentId || null,
            transactionId: paymentData?.transactionId || null,
            chapter: updatedEvent.chapter || "",
            meetingLink: updatedEvent.meetingLink || "",
            isGuest: attendeeRole === "guest" || user?.role === "guest",
          });
        }

        if (user?.phone) {
          whatsappService.sendEventTicket({
            phone: user.phone,
            userName: user.name,
            eventTitle: updatedEvent.title,
            eventDate: updatedEvent.date || "Upcoming Chamber Event",
            location: updatedEvent.venue || updatedEvent.location || "Chamber Main Hall",
            ticketId,
            verificationUrl,
          }).catch(waErr => console.error("[WHATSAPP EVENT TICKET ERROR]:", waErr?.message || waErr));
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

    const eventObj = updatedEvent.toObject ? updatedEvent.toObject() : updatedEvent;
    return {
      ...eventObj,
      ticket: {
        ticketId,
        ticketType,
        verificationToken,
        verificationUrl,
      },
    };
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
    const query = skipOwnerScope ? { _id: eventId } : buildManageScopeQuery(eventId, user);
    const event = await Event.findOne(query).lean();

    if (!event) {
      throw new NotFoundError("Event not found or you don't have permission to view registrations");
    }

    // Resolve every entry's userId first, then fetch all Users and all Businesses in two
    // batched queries instead of 2 sequential queries per attendee (was an N+1: 2×N
    // round-trips for an event with N registrations).
    const parsedEntries = [];
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
      parsedEntries.push({ entry, userId, registeredAt, status, _id, gateStatus });
    }

    const userIds = parsedEntries.map((p) => p.userId);
    const BusinessModel = mongoose.model("Business");
    const [users, businesses] = await Promise.all([
      User.find({ _id: { $in: userIds } }).select("name email phone role chapter businessName").lean(),
      BusinessModel.find({ owner: { $in: userIds } }).lean(),
    ]);
    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const businessMap = new Map(businesses.map((b) => [String(b.owner), b]));

    const registrations = [];
    for (const { entry, userId, registeredAt, status, _id, gateStatus } of parsedEntries) {
      const userData = userMap.get(String(userId)) || null;
      const business = businessMap.get(String(userId)) || null;

      let computedRole = "guest";
      if (userData && userData.role !== "customer") {
        if (business) {
          if (business.verification === "verified" || business.verification === "Verified") {
            computedRole = "member";
          } else {
            computedRole = "non_member";
          }
        } else if (entry.role) {
          computedRole = entry.role; // Fallback to saved role if business not found
        }
      } else if (entry.role && entry.role !== "customer") {
         // If it's a customer, ensure we stick to guest unless explicitly saved as something else that's valid
         computedRole = entry.role === "member" ? "guest" : entry.role; 
      }

      registrations.push({
        _id,
        user: userData || { name: "Deleted User", email: "N/A" },
        registeredAt,
        status,
        gateStatus,
        attendanceStatus: entry.attendanceStatus || "Pending",
        role: computedRole,
      });
    }

    return registrations;
  },

  /**
   * Update event details \u2014 preserves creator-scope RBAC
   */
  updateEvent: async (id, updateData, user) => {
    const query = buildManageScopeQuery(id, user);
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

    // RBAC: Country/Chapter Admin Scope Enforcement
    if (user) {
      if (user.role === ROLES.COUNTRY_ADMIN) {
        delete updateData.country;
        delete updateData.countryId;
        delete updateData.targetCountries;
      } else if (user.role === ROLES.CHAPTER_ADMIN) {
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

    // ── Delegation Event Central Admin Check & Installments ──
    const isDelegation = updateData.eventCategory === "Delegation" || Boolean(updateData.isDelegation) || existing.eventCategory === "Delegation" || Boolean(existing.isDelegation);
    if (updateData.eventCategory === "Delegation" || Boolean(updateData.isDelegation)) {
      const isCentralAdmin = user && ["central_admin", "super_admin", "admin", "secretariat"].includes(user.role);
      if (!isCentralAdmin) {
        throw new ForbiddenError("Only Central Admin has the option to create or manage a Delegation Event");
      }
      updateData.eventCategory = "Delegation";
      updateData.isDelegation = true;
      updateData.isPaid = true;

      if (Array.isArray(updateData.delegationInstallments) && updateData.delegationInstallments.length > 0) {
        updateData.delegationInstallments = updateData.delegationInstallments.map((inst, idx) => ({
          installmentNumber: Number(inst.installmentNumber) || idx + 1,
          title: (inst.title || `Installment ${idx + 1}`).trim(),
          dueDate: String(inst.dueDate || "").trim(),
          memberAmount: Number(inst.memberAmount) || 0,
          nonMemberAmount: Number(inst.nonMemberAmount) || 0,
          notes: inst.notes || "",
        }));

        const totalMember = updateData.delegationInstallments.reduce((acc, i) => acc + (Number(i.memberAmount) || 0), 0);
        const totalNonMember = updateData.delegationInstallments.reduce((acc, i) => acc + (Number(i.nonMemberAmount) || 0), 0);
        updateData.memberPrice = totalMember;
        updateData.ticketPrice = totalNonMember;
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

    // BUG-007: Publication date (scheduledAt) must not be after the event date,
    // re-checked here against the merged (existing + incoming) values so a partial
    // PATCH that only touches one of the two fields is still validated correctly.
    if (updateData.scheduledAt !== undefined || updateData.date !== undefined) {
      const effectiveScheduledAt = updateData.scheduledAt !== undefined ? updateData.scheduledAt : existing.scheduledAt;
      const effectiveDate = updateData.date !== undefined ? updateData.date : existing.date;
      if (effectiveScheduledAt && effectiveDate) {
        const pubDate = new Date(effectiveScheduledAt);
        const eventDate = new Date(effectiveDate);
        if (!isNaN(pubDate.getTime()) && !isNaN(eventDate.getTime()) && pubDate.getTime() > eventDate.getTime()) {
          throw new BadRequestError("Publication date cannot be after the event date");
        }
      }
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
    const query = buildManageScopeQuery(id, user);
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

    // BUG-030: "approved" must be driven by the dedicated entrance-desk gateStatus
    // field (set only via the explicit gate approve/reject action), not by the
    // registration status — otherwise every new "Register" click (status defaults
    // to "Confirmed") was counted as "Approved" too, coupling two independent flows.
    const approvedCount = registeredUsers.filter((r) => r.gateStatus === "approved").length;

    const isAdmin =
      user &&
      [
        ROLES.CENTRAL_ADMIN,
        ROLES.SUPER_ADMIN,
        ROLES.ADMIN,
        ROLES.SECRETARIAT,
        ROLES.COUNTRY_ADMIN,
        ROLES.STATE_ADMIN,
        ROLES.CHAPTER_ADMIN,
        "super_admin",
        "admin",
      ].includes(user.role);

    const ops = {
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
        ticketPrice: isAdmin ? event.ticketPrice : undefined,
        fee: isAdmin ? event.fee : undefined,
        stageStatus: event.stageStatus || "IDLE",
        currentSlideIndex: event.currentSlideIndex || 0,
        activeAnnouncement: event.activeAnnouncement || "",
        moderatorNotes: event.moderatorNotes || "",
        projectorMode: event.projectorMode || "auto",
        speakers: event.speakers || [],
        finance: isAdmin ? (event.finance || { moneyIn: [], moneyOut: [], treasurerNotes: "" }) : { moneyIn: [], moneyOut: [], treasurerNotes: "" },
        teamAssignments: event.teamAssignments || [],
        signatories: event.signatories || { signatory1: "Chapter President", signatory2: "Chapter Secretary" },
        agenda: event.agenda || [],
        slogan: event.slogan || "",
        theme: event.theme || "",
        scriptLanguage: event.scriptLanguage || "English",
        certificateSettings: event.certificateSettings || { theme: "classic-gold", language: "English", enabled: true },
        membershipRules: event.membershipRules || "Members enter free with valid Chamber ID.",
        visitorSignIn: event.visitorSignIn !== false,
        memberFee: isAdmin ? (event.memberFee !== undefined ? event.memberFee : 0) : undefined,
        nonMemberFee: isAdmin ? (event.nonMemberFee !== undefined ? event.nonMemberFee : 500) : undefined,
        paymentCodes: isAdmin ? (event.paymentCodes || []) : [],
        staffCodes: isAdmin ? (event.staffCodes || []) : [],
        membershipJoiningLink: event.membershipJoiningLink || "",
        membershipQrImage: event.membershipQrImage || "",
        // eventPoster is legacy Operations-Centre-only storage; posterImage is the field
        // actually written by the real event poster upload (POST /events/:id/poster) —
        // prefer it so Operations Centre shows whatever poster was actually uploaded.
        eventPoster: event.posterImage || event.eventPoster || "",
        repeatGuestThreshold: event.repeatGuestThreshold !== undefined ? event.repeatGuestThreshold : 3,
        remindRepeatGuests: event.remindRepeatGuests !== false,
        downloadListPermission: event.downloadListPermission || "Everyone (members and guests)",
        certificateStyle: event.certificateStyle || "rifah-signature",
        certificateAccentColor: event.certificateAccentColor || "#059669",
        signatory1Role: event.signatory1Role || "Chapter President",
        signatory1Name: event.signatory1Name || "",
        signatory1Image: event.signatory1Image || "",
        signatory2Role: event.signatory2Role || "Chapter Secretary",
        signatory2Name: event.signatory2Name || "",
        signatory2Image: event.signatory2Image || "",
        certificateDesign: event.certificateDesign || { preset: "rifah-signature" },
        certificateDesignV2: event.certificateDesignV2 || null,
        logoImage: event.logoImage || "",
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
        fees: isAdmin ? totalFees : 0,
      },
      kpis: {
        registered: totalRegistered,
        approved: approvedCount,
        members: membersCount,
        checkedIn: checkedIn,
        fees: isAdmin ? totalFees : 0,
      },
      attendees: registeredUsers.map((reg, idx) => {
        const u = reg.user || {};
        let roleDisplay = "Guest";
        if (reg.role === "member") roleDisplay = "Member";
        else if (reg.role === "non_member") roleDisplay = "Non Member";

        return {
          id: reg._id || `att-${idx}`,
          userId: u._id || reg.user,
          name: u.name || "Attendee " + (idx + 1),
          email: u.email || "",
          mobile: u.phone || u.whatsapp || u.mobile || "Not provided",
          company: u.organization || u.company || "Enterprise",
          city: u.city || event.city || "Mumbai",
          role: reg.role || "guest",
          isMember: reg.role === "member",
          membership: roleDisplay,
          membershipStatus: roleDisplay,
          approvalStatus:
            reg.status === "Cancelled"
              ? "Rejected"
              : reg.gateStatus === "approved"
              ? "Approved"
              : reg.gateStatus === "rejected"
              ? "Rejected"
              : "Pending",
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

    return ops;
  },

  /**
   * RIFAH Operations Center: Update operations data for an event
   */
  updateOperations: async (eventId, data, user) => {
    const isAdmin =
      user &&
      [
        ROLES.CENTRAL_ADMIN,
        ROLES.SUPER_ADMIN,
        ROLES.ADMIN,
        ROLES.SECRETARIAT,
        ROLES.COUNTRY_ADMIN,
        ROLES.STATE_ADMIN,
        ROLES.CHAPTER_ADMIN,
        "super_admin",
        "admin",
      ].includes(user.role);

    if (!isAdmin) {
      const restrictedFields = [
        "finance",
        "isPaid",
        "ticketPrice",
        "fee",
        "memberFee",
        "nonMemberFee",
        "paymentCodes",
        "staffCodes",
        "signatories",
        "signatory1Role",
        "signatory1Name",
        "signatory1Image",
        "signatory2Role",
        "signatory2Name",
        "signatory2Image",
        "certificateSettings",
        "certificateDesign",
        "certificateDesignV2",
        "certificateStyle",
        "certificateAccentColor",
      ];
      for (const field of restrictedFields) {
        if (data[field] !== undefined) {
          throw new ForbiddenError(
            `Access denied. You are not authorized to modify ${field}.`
          );
        }
      }
    }

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
      "logoImage",
      "certificateDesign",
      "certificateDesignV2",
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

    // BUG-040: the event schema carries THREE separate places that store the same
    // "signatory 1 / signatory 2" role text — `signatories.signatory1/2`,
    // `certificateSettings.signatory1/2`, and the canonical `signatory1Role` /
    // `signatory2Role` flat fields — which is why the Certificate Settings screen
    // shows signatory 1 in more than one section. Only the flat fields are actually
    // read by certificate generation (see certificate.util.js), so if an admin edits
    // the role via the legacy `signatories` or `certificateSettings` objects, mirror
    // it into the flat fields too, unless this same request already set the flat
    // field explicitly (which wins).
    if (updateObj.signatories) {
      if (updateObj.signatories.signatory1 !== undefined && updateObj.signatory1Role === undefined) {
        updateObj.signatory1Role = updateObj.signatories.signatory1;
      }
      if (updateObj.signatories.signatory2 !== undefined && updateObj.signatory2Role === undefined) {
        updateObj.signatory2Role = updateObj.signatories.signatory2;
      }
    }
    if (updateObj.certificateSettings) {
      if (updateObj.certificateSettings.signatory1 !== undefined && updateObj.signatory1Role === undefined) {
        updateObj.signatory1Role = updateObj.certificateSettings.signatory1;
      }
      if (updateObj.certificateSettings.signatory2 !== undefined && updateObj.signatory2Role === undefined) {
        updateObj.signatory2Role = updateObj.certificateSettings.signatory2;
      }
    }

    // BUG-001/002/003: Speakers & Guests entries (name/mobile/email) were saved with
    // zero format validation via Operations Centre.
    if (Array.isArray(updateObj.speakers)) {
      for (const sp of updateObj.speakers) {
        if (!sp || typeof sp !== "object") continue;
        const spName = sp.name !== undefined && sp.name !== null ? String(sp.name).trim() : "";
        if (spName !== "" && !isValidName(spName)) {
          throw new BadRequestError(`Speaker name "${sp.name}" must contain only letters`);
        }
        const spMobile = sp.mobile !== undefined && sp.mobile !== null ? String(sp.mobile).trim() : "";
        if (spMobile !== "" && !isValidPhone(spMobile)) {
          throw new BadRequestError(`Speaker mobile number "${sp.mobile}" is invalid`);
        }
        const spEmail = sp.email !== undefined && sp.email !== null ? String(sp.email).trim() : "";
        if (spEmail !== "" && !isValidEmail(spEmail)) {
          throw new BadRequestError(`Speaker email "${sp.email}" is invalid`);
        }
        if (sp.email !== undefined) {
          sp.email = spEmail ? spEmail.toLowerCase() : "";
        }
      }
    }

    // BUG-009: the Operations Center form had no validation at all — any numeric
    // field could be saved as negative or non-numeric. Guard the numeric fields
    // that are safe to check generically here (money/seat/count values must be
    // non-negative finite numbers).
    const nonNegativeNumericFields = ["seats", "ticketPrice", "memberFee", "nonMemberFee", "repeatGuestThreshold"];
    for (const key of nonNegativeNumericFields) {
      if (updateObj[key] === undefined) continue;
      const num = Number(updateObj[key]);
      if (!Number.isFinite(num) || num < 0) {
        throw new BadRequestError(`${key} must be a valid non-negative number`);
      }
      updateObj[key] = num;
    }

    const updated = await Event.findByIdAndUpdate(eventId, { $set: updateObj }, { new: true, runValidators: true });
    if (!updated) throw new NotFoundError("Event not found");

    if (Array.isArray(updateObj.speakers)) {
      try {
        const { Dignitary } = await import("../dignitaries/dignitary.model.js");
        for (const sp of updateObj.speakers) {
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
                $setOnInsert: {
                  createdBy: user?._id || user?.id,
                },
              },
              { upsert: true, new: true }
            );
          }
        }
      } catch (err) {
        // Non-blocking sync error
      }
    }

    // Real-time projector and live control sync
    try {
      const { emitProjectorUpdate } = await import("../../infrastructure/socket/socket.js");
      const broadcastPayload = {
        target: updated.chapter || updated._id,
        slideIndex: updated.currentSlideIndex,
        stageStatus: updated.stageStatus,
        mode: updated.projectorMode,
        announcement: updated.activeAnnouncement,
        moderatorNotes: updated.moderatorNotes,
      };
      if (updated.chapter) {
        emitProjectorUpdate(updated.chapter, broadcastPayload);
      }
      emitProjectorUpdate(String(updated._id), { ...broadcastPayload, target: String(updated._id) });
    } catch (_) {
      // Non-blocking socket emission
    }

    return updated;
  },

  // BUG-060: "Keynote 1/2 Poster" in My Team's Role Assignments section was a `disabled`
  // "Choose File" button with no onChange and no backend field to hold it at all — a pure
  // UI stub. updateOperations's `teamAssignments` field is a whole-object replace, so a
  // dedicated endpoint that $sets only this one nested path is used instead of round-
  // tripping the entire teamAssignments object through the client — the poster then
  // persists the instant it's uploaded, the same way Save Assignments doesn't need to be
  // clicked for anything else that already auto-saves.
  setKeynotePoster: async (eventId, slot, posterUrl, user) => {
    const field = slot === "2" ? "keynote2Poster" : "keynote1Poster";
    const updated = await Event.findByIdAndUpdate(
      eventId,
      { $set: { [`teamAssignments.${field}`]: posterUrl } },
      { new: true, runValidators: true }
    );
    if (!updated) throw new NotFoundError("Event not found");
    return updated;
  },

  /**
   * RIFAH Operations Center: Append financial transaction (Money In / Money Out)
   */
  addFinanceTransaction: async (eventId, transactionData, user) => {
    const event = await Event.findById(eventId);
    if (!event) throw new NotFoundError("Event not found");

    const isAdmin = [ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN].includes(user?.role);
    if (!isAdmin && !isEventLive(event)) {
      throw new ForbiddenError("Finance entries open once the admin takes this event live.");
    }

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
   * Guest & Speaker Manager (admin or the event's assigned guestManager): add one
   * speaker/guest to this event. Scoped, single-item mutation — mirrors
   * addFinanceTransaction above — rather than the admin dashboard's own whole-array
   * `updateOperations({ speakers })` replace, which only admins may call and which two
   * concurrent editors would silently clobber each other on.
   */
  addSpeaker: async (eventId, speakerData) => {
    const event = await Event.findById(eventId);
    if (!event) throw new NotFoundError("Event not found");

    const {
      name,
      category,
      mobile,
      email,
      type,
      organization,
      org,
      designation,
      topic,
      photo,
      status,
      dignitaryId,
      assignedRole,
    } = speakerData;

    const trimmedName = name ? String(name).trim() : "";
    const trimmedMobile = mobile ? String(mobile).trim() : "";
    const cleanEmail = email !== undefined && email !== null ? String(email).trim() : "";

    if (!trimmedName || !isValidName(trimmedName)) {
      throw new BadRequestError("Enter a valid speaker name (letters only).");
    }
    if (!trimmedMobile) {
      throw new BadRequestError("Please enter the speaker's mobile number.");
    }
    if (cleanEmail && !isValidEmail(cleanEmail)) {
      throw new BadRequestError("Enter a valid speaker email address.");
    }

    const speaker = {
      id: `sp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: trimmedName,
      category: category || "",
      mobile: trimmedMobile,
      email: cleanEmail ? cleanEmail.toLowerCase() : "",
      type: type || "Guest Speaker",
      organization: organization || org || "",
      designation: designation || "",
      topic: topic || "",
      photo: photo || "",
      status: status || "Confirmed",
      dignitaryId: dignitaryId || null,
      assignedRole: assignedRole || "",
    };

    event.speakers = [...(event.speakers || []), speaker];
    await event.save();

    // If linked or matches a dignitary in directory, sync
    try {
      const { Dignitary } = await import("../dignitaries/dignitary.model.js");
      const filter = dignitaryId
        ? { _id: dignitaryId }
        : { mobile: speaker.mobile };
      await Dignitary.findOneAndUpdate(
        filter,
        {
          $set: {
            name: speaker.name,
            mobile: speaker.mobile,
            email: speaker.email,
            org: speaker.organization,
            designation: speaker.designation,
            category: speaker.category,
            type: speaker.type,
            topic: speaker.topic,
            photo: speaker.photo,
            status: speaker.status,
          },
        },
        { new: true }
      );
    } catch (_) {}

    return event.speakers;
  },

  updateSpeaker: async (eventId, speakerId, speakerData) => {
    const event = await Event.findById(eventId);
    if (!event) throw new NotFoundError("Event not found");

    const idx = (event.speakers || []).findIndex(
      (s) => s.id === speakerId || String(s._id) === String(speakerId)
    );
    if (idx === -1) throw new NotFoundError("Speaker not found on this event");

    const {
      name,
      category,
      mobile,
      email,
      type,
      organization,
      org,
      designation,
      topic,
      photo,
      status,
      dignitaryId,
      assignedRole,
    } = speakerData;

    const trimmedName = name !== undefined && name !== null ? String(name).trim() : undefined;
    const cleanEmail = email !== undefined && email !== null ? String(email).trim() : undefined;

    if (trimmedName !== undefined && !isValidName(trimmedName)) {
      throw new BadRequestError("Enter a valid speaker name (letters only).");
    }
    if (cleanEmail !== undefined && cleanEmail !== "" && !isValidEmail(cleanEmail)) {
      throw new BadRequestError("Enter a valid speaker email address.");
    }

    const current = event.speakers[idx];
    if (trimmedName !== undefined) current.name = trimmedName;
    if (category !== undefined) current.category = category;
    if (mobile !== undefined) current.mobile = String(mobile).trim();
    if (cleanEmail !== undefined) current.email = cleanEmail ? cleanEmail.toLowerCase() : "";
    if (type !== undefined) current.type = type;
    if (organization !== undefined || org !== undefined) current.organization = organization || org || "";
    if (designation !== undefined) current.designation = designation;
    if (topic !== undefined) current.topic = topic;
    if (photo !== undefined) current.photo = photo;
    if (status !== undefined) current.status = status;
    if (dignitaryId !== undefined) current.dignitaryId = dignitaryId;
    if (assignedRole !== undefined) current.assignedRole = assignedRole;

    await event.save();

    // Sync to dignitary directory
    try {
      const { Dignitary } = await import("../dignitaries/dignitary.model.js");
      const filter = current.dignitaryId
        ? { _id: current.dignitaryId }
        : { mobile: current.mobile };
      await Dignitary.findOneAndUpdate(
        filter,
        {
          $set: {
            name: current.name,
            mobile: current.mobile,
            email: current.email,
            org: current.organization,
            designation: current.designation,
            category: current.category,
            type: current.type,
            topic: current.topic,
            photo: current.photo,
            status: current.status,
          },
        },
        { new: true }
      );
    } catch (_) {}

    return event.speakers;
  },

  removeSpeaker: async (eventId, speakerId) => {
    const event = await Event.findById(eventId);
    if (!event) throw new NotFoundError("Event not found");

    const existed = (event.speakers || []).some(
      (s) => s.id === speakerId || String(s._id) === String(speakerId)
    );
    if (!existed) throw new NotFoundError("Speaker not found on this event");

    event.speakers = event.speakers.filter(
      (s) => s.id !== speakerId && String(s._id) !== String(speakerId)
    );
    await event.save();
    return event.speakers;
  },

  getSpeakers: async (eventId, user) => {
    const event = await Event.findById(eventId).lean();
    if (!event) throw new NotFoundError("Event not found");

    return {
      eventId: event._id,
      eventTitle: event.title,
      eventDate: event.date,
      eventTime: event.time,
      chapter: event.chapter,
      venue: event.venue,
      city: event.city,
      speakers: event.speakers || [],
      agenda: event.agenda || [],
      teamAssignments: event.teamAssignments || [],
    };
  },

  updateSpeakerPhoto: async (eventId, speakerId, photoUrl, user) => {
    const event = await Event.findById(eventId);
    if (!event) throw new NotFoundError("Event not found");

    const idx = (event.speakers || []).findIndex(
      (s) => s.id === speakerId || String(s._id) === String(speakerId)
    );
    if (idx === -1) throw new NotFoundError("Speaker not found on this event");

    event.speakers[idx].photo = photoUrl;
    await event.save();

    try {
      const { Dignitary } = await import("../dignitaries/dignitary.model.js");
      const sp = event.speakers[idx];
      if (sp.dignitaryId) {
        await Dignitary.findByIdAndUpdate(sp.dignitaryId, { photo: photoUrl });
      } else if (sp.mobile) {
        await Dignitary.findOneAndUpdate({ mobile: sp.mobile }, { photo: photoUrl });
      }
    } catch (_) {}

    return { photo: photoUrl, speakers: event.speakers };
  },

  assignSpeakerProgrammeRole: async (eventId, speakerId, { roleKey, agendaId, topic }, user) => {
    const event = await Event.findById(eventId);
    if (!event) throw new NotFoundError("Event not found");

    const idx = (event.speakers || []).findIndex(
      (s) => s.id === speakerId || String(s._id) === String(speakerId)
    );
    if (idx === -1) throw new NotFoundError("Speaker not found on this event");

    const speaker = event.speakers[idx];
    if (roleKey !== undefined) {
      speaker.assignedRole = roleKey;
    }
    if (topic !== undefined && topic !== "") {
      speaker.topic = topic;
    }

    if (roleKey && Array.isArray(event.teamAssignments)) {
      const teamIdx = event.teamAssignments.findIndex(
        (t) => t.role === roleKey || t.roleName === roleKey
      );
      if (teamIdx !== -1) {
        event.teamAssignments[teamIdx].member = speaker.name;
        event.teamAssignments[teamIdx].topic = topic || speaker.topic || "";
      }
    }

    if (agendaId && Array.isArray(event.agenda)) {
      const agendaIdx = event.agenda.findIndex(
        (a) => a.id === agendaId || String(a._id) === String(agendaId)
      );
      if (agendaIdx !== -1) {
        event.agenda[agendaIdx].speaker = speaker.name;
        if (topic) event.agenda[agendaIdx].title = topic;
      }
    }

    await event.save();
    return {
      speaker,
      speakers: event.speakers,
      teamAssignments: event.teamAssignments,
      agenda: event.agenda,
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

        // 3. Automated check and notification dispatch for Delegation Event installments
        try {
          await eventService.checkDelegationInstallmentReminders();
        } catch (remindErr) {
          console.error("[EventScheduler] Error checking delegation installment reminders:", remindErr);
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
    const user = await User.findById(userId).select("role chapter").lean();
    const events = await Event.find({ "roleAssignments.user": userId })
      .select("title date chapter creatorState visibilityScope status stageStatus roleAssignments")
      .lean();

    const assignments = [];
    const seenEventIds = new Set();
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
          seenEventIds.add(String(event._id));
        }
      }
    }

    if (
      user &&
      (user.role === "guest_speaker_manager" ||
        user.role === "guestManager" ||
        user.role === "event_coordinator" ||
        user.role === "eventCoordinator")
    ) {
      const chapterQuery = user.chapter
        ? { $or: [{ chapter: user.chapter }, { chapter: "Global" }, { chapter: { $regex: /all chapters/i } }] }
        : {};
      const chapterEvents = await Event.find(chapterQuery)
        .select("title date chapter creatorState visibilityScope status stageStatus roleAssignments")
        .sort({ date: -1 })
        .limit(20)
        .lean();

      const defaultRole =
        user.role === "event_coordinator" || user.role === "eventCoordinator"
          ? "eventCoordinator"
          : "guestManager";

      for (const ev of chapterEvents) {
        if (!seenEventIds.has(String(ev._id))) {
          assignments.push({
            eventId: ev._id,
            eventTitle: ev.title,
            eventDate: ev.date,
            chapter: ev.chapter,
            state: ev.creatorState || "",
            scope: ev.visibilityScope || "global",
            status: ev.status,
            stageStatus: ev.stageStatus,
            isLive: isEventLive(ev),
            role: defaultRole,
          });
          seenEventIds.add(String(ev._id));
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

    const isDirectGuestManager =
      user.role === "guest_speaker_manager" ||
      user.role === "guestManager" ||
      (user.chapter && (event.chapter === user.chapter || event.chapter === "Global"));

    if (
      (user.role === "guest_speaker_manager" || user.role === "guestManager") &&
      !assignedRoles.includes("guestManager")
    ) {
      assignedRoles.push("guestManager");
    }

    if (
      (user.role === "event_coordinator" || user.role === "eventCoordinator") &&
      !assignedRoles.includes("eventCoordinator")
    ) {
      assignedRoles.push("eventCoordinator");
    }

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
      // Tools stay read-only until the admin takes the event live. Guest managers and event coordinators can always act on their assigned domains.
      isLive: live,
      canAct: live || isAdmin || myRoles.includes("guestManager") || myRoles.includes("eventCoordinator"),
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
      base.data.agenda = event.agenda || [];
      base.data.teamAssignments = event.teamAssignments || [];
    }
    if (myRoles.includes("eventCoordinator")) {
      base.data.agenda = event.agenda || [];
      base.data.kpi = {
        registeredCount: (event.registeredUsers || []).length,
        // BUG: the Event schema field is `totalSeats`, not `seats` — reading the wrong
        // (nonexistent) field meant this always showed "0 seats" regardless of the real
        // configured capacity.
        seats: event.totalSeats,
      };
      // Remote Live Control: only unlocked when the admin explicitly checked "let the
      // Event Coordinator run the programme from his own phone" for this event.
      base.data.allowCoordinatorRemote = Boolean(event.teamAssignments?.allowCoordinatorRemote);
      base.data.currentSlideIndex = event.currentSlideIndex || 0;
      base.data.projectorMode = event.projectorMode || "slides";
      base.data.chapter = event.chapter;
    }
    if (myRoles.includes("photosVideo")) {
      base.data.mediaCount = await eventMediaService.countForEvent(eventId);
    }

    return base;
  },

  /**
   * Event Coordinator's own Next/Hold slide control (My Duty panel), separate from the
   * admin-only /operations endpoint — only unlocked when the admin checked "let the Event
   * Coordinator run the programme from his own phone" for this event.
   */
  async updateCoordinatorSlide(eventId, slideIndex, user) {
    const event = await Event.findById(eventId);
    if (!event) throw new NotFoundError("Event not found");

    const isAdmin = [ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN].includes(user.role);
    if (!isAdmin && !event.teamAssignments?.allowCoordinatorRemote) {
      throw new ForbiddenError("Remote stage control is not enabled for this event.");
    }

    const index = Number(slideIndex);
    const agendaLength = (event.agenda || []).length;
    if (!Number.isInteger(index) || index < 0 || (agendaLength > 0 && index >= agendaLength)) {
      throw new BadRequestError("slideIndex is out of range for this event's agenda.");
    }

    event.currentSlideIndex = index;
    await event.save();
    return { currentSlideIndex: index };
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

  /**
   * Public Secure Verification for an Event Ticket / Digital Entry Pass
   */
  verifyTicket: async (ticketId, token = null) => {
    if (!ticketId || typeof ticketId !== "string") {
      return {
        verified: false,
        error: "INVALID_REQUEST",
        message: "Ticket ID is required for verification.",
      };
    }

    const { event, reg, cleanTicketId } = await resolveEventAndRegistration(
      ticketId,
      "name email phone company businessName chapter state profilePhoto"
    );

    if (!event || !reg) {
      return {
        verified: false,
        error: "TICKET_NOT_FOUND",
        message: "This QR code does not correspond to a valid RIFAH event ticket.",
      };
    }

    // Auto-generate ticketId & verificationToken if legacy record
    let needsSave = false;
    if (!reg.ticketId) {
      reg.ticketId = `RIFAH-EVT-${new Date().getFullYear()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      needsSave = true;
    }
    if (!reg.verificationToken) {
      reg.verificationToken = crypto.randomBytes(24).toString("hex");
      needsSave = true;
    }
    if (needsSave) {
      await event.save();
    }

    // Validate secure token if provided
    if (token && token.trim() && !needsSave) {
      if (reg.verificationToken && reg.verificationToken.trim() && reg.verificationToken.trim() !== token.trim()) {
        return {
          verified: false,
          error: "INVALID_TOKEN",
          message: "The verification token is invalid or does not match this event ticket.",
        };
      }
    }

    // Check cancellation
    if (reg.ticketStatus === "Cancelled" || reg.status === "Cancelled") {
      return {
        verified: false,
        status: "CANCELLED",
        ticketId: reg.ticketId,
        eventTitle: event.title,
        message: "This ticket has been cancelled.",
      };
    }

    // Check refund
    if (reg.ticketStatus === "Refunded") {
      return {
        verified: false,
        status: "REFUNDED",
        ticketId: reg.ticketId,
        eventTitle: event.title,
        message: "This event registration has been refunded.",
      };
    }

    // Check unpaid state
    if (event.isPaid && reg.paymentStatus !== "Paid" && reg.paymentStatus !== "Free") {
      return {
        verified: false,
        status: "UNPAID",
        ticketId: reg.ticketId,
        eventTitle: event.title,
        message: "Payment has not been completed for this event pass.",
      };
    }

    // Check expiration
    let isExpired = false;
    if (event.date) {
      try {
        const evtDate = new Date(event.date);
        if (!isNaN(evtDate.getTime()) && Date.now() - evtDate.getTime() > 24 * 60 * 60 * 1000) {
          isExpired = true;
        }
      } catch (_) {}
    }

    const attendeeUser = reg.user;
    const attendeeName = attendeeUser?.name || "Registered Attendee";
    const attendeeEmail = attendeeUser?.email || "";
    const attendeeCompany = attendeeUser?.company || attendeeUser?.businessName || "";
    const attendeePhone = attendeeUser?.phone || "";

    const isCheckedIn = Boolean(reg.checkedIn || reg.attendanceStatus === "Present");

    return {
      verified: true,
      ticketId: reg.ticketId,
      attendeeName,
      attendeeEmail,
      attendeeCompany,
      attendeePhone,
      eventTitle: event.title,
      eventId: event._id,
      eventDate: event.date,
      eventTime: event.time,
      eventVenue: event.venue,
      eventCity: event.city || "All Cities",
      eventChapter: event.chapter,
      ticketType: reg.ticketType || (event.isPaid ? "Paid Pass" : "Member Pass"),
      registrationStatus: reg.status || "Confirmed",
      paymentStatus: reg.paymentStatus || (event.isPaid ? "Paid" : "Free"),
      amountPaid: reg.amountPaid || (event.isPaid ? event.ticketPrice : 0),
      checkedIn: isCheckedIn,
      checkedInAt: reg.checkedInAt || (isCheckedIn ? reg.gateApprovedAt || null : null),
      checkedInBy: reg.checkedInBy || (isCheckedIn ? "Event Staff" : ""),
      isExpired,
      issuedBy: "RIFAH Chamber of Commerce & Industry",
    };
  },

  /**
   * Staff / Admin Event Check-in
   * Strictly prevents duplicate check-ins!
   */
  checkInTicket: async (ticketId, staffName = "Event Staff", staffUser = null) => {
    if (!ticketId || typeof ticketId !== "string") {
      throw new BadRequestError("Ticket ID is required.");
    }

    const { event, reg, cleanTicketId } = await resolveEventAndRegistration(
      ticketId,
      "name email phone company businessName chapter state"
    );

    if (!event || !reg) {
      throw new NotFoundError("Ticket not found.");
    }

    // Only a chamber admin, or the member this event's admin assigned as Gate/Entrance
    // Incharge, can check someone in — scoped to that specific event, same as every other
    // "My Duty" tool.
    const isAdmin = [ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN].includes(staffUser?.role);
    if (!isAdmin) {
      const staffId = staffUser?.id || staffUser?._id;
      const allowed = staffId && (await eventService.hasEventRole(staffId, event._id, "entranceIncharge"));
      if (!allowed) {
        throw new ForbiddenError("You are not assigned as Gate/Entrance Incharge for this event.");
      }
      if (!isEventLive(event)) {
        throw new ForbiddenError("The gate opens once the admin takes this event live.");
      }
    }

    if (reg.ticketStatus === "Cancelled" || reg.status === "Cancelled") {
      throw new BadRequestError("This ticket has been cancelled and cannot be checked in.");
    }

    if (reg.ticketStatus === "Refunded") {
      throw new BadRequestError("This ticket was refunded and cannot be checked in.");
    }

    // DUPLICATE CHECK-IN PREVENTION
    if (reg.checkedIn || reg.attendanceStatus === "Present") {
      const checkinDate = reg.checkedInAt || reg.gateApprovedAt || new Date();
      const formattedTime = new Date(checkinDate).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      return {
        alreadyCheckedIn: true,
        success: false,
        ticketId: reg.ticketId,
        attendeeName: reg.user?.name || "Attendee",
        eventTitle: event.title,
        checkedInAt: formattedTime,
        checkedInBy: reg.checkedInBy || "Event Staff",
        message: `ALREADY CHECKED IN at ${formattedTime} by ${reg.checkedInBy || "Event Staff"}. Duplicate check-ins are not allowed.`,
      };
    }

    // Perform Check-in
    const now = new Date();
    const performer = staffUser?.name || staffName || "Event Staff";

    reg.checkedIn = true;
    reg.checkedInAt = now;
    reg.checkedInBy = performer;
    reg.checkedInById = staffUser?._id || null;
    reg.attendanceStatus = "Present";
    reg.gateStatus = "approved";
    reg.gateApprovedAt = now;

    await event.save();

    const formattedTime = now.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    return {
      alreadyCheckedIn: false,
      success: true,
      verified: true,
      ticketId: reg.ticketId,
      attendeeName: reg.user?.name || "Attendee",
      eventTitle: event.title,
      checkedInAt: formattedTime,
      checkedInBy: performer,
      message: "✓ Attendee successfully marked as checked in.",
    };
  },

  /**
   * Digital Pass Retrieval for Attendee Wallet / Mobile View
   */
  getTicketPass: async (ticketId, token = null) => {
    return eventService.verifyTicket(ticketId, token);
  },

  /**
   * Admin Update Ticket Status (Cancel / Refund / Re-activate)
   */
  updateTicketStatus: async (ticketId, newStatus, reason = "", adminUserId = null) => {
    if (!ticketId) throw new BadRequestError("Ticket ID is required.");

    const { event, reg } = await resolveEventAndRegistration(ticketId, "");

    if (!event || !reg) throw new NotFoundError("Ticket not found.");

    reg.ticketStatus = newStatus;
    if (newStatus === "Cancelled") {
      reg.status = "Cancelled";
    }
    await event.save();

    return {
      success: true,
      ticketId: reg.ticketId,
      ticketStatus: reg.ticketStatus,
      message: `Ticket status successfully updated to ${newStatus}.`,
    };
  },

  /**
   * Pay a Delegation Event Installment with 5% GST and 2% TCS, generating an invoice
   */
  async payDelegationInstallment(eventId, userId, installmentNumber, paymentData = {}) {
    const event = await Event.findById(eventId);
    if (!event) throw new NotFoundError("Event not found");

    const registration = (event.registeredUsers || []).find(
      (r) => String(r.user?._id || r.user || r._id) === String(userId)
    );
    if (!registration) throw new NotFoundError("Registration not found for this user");

    if (!Array.isArray(registration.installments) || registration.installments.length === 0) {
      throw new BadRequestError("No delegation installments configured for this attendee");
    }

    const inst = registration.installments.find(
      (i) => i.installmentNumber === Number(installmentNumber)
    );
    if (!inst) throw new NotFoundError(`Installment #${installmentNumber} not found`);

    if (inst.status === "Paid") {
      throw new BadRequestError(`Installment #${installmentNumber} has already been paid`);
    }

    // Delegation Tax Rules: 5% GST and 2% TCS
    const baseAmount = Number(inst.baseAmount) || 0;
    const gstRate = 5;
    const gstAmount = Math.round((baseAmount * 0.05) * 100) / 100;
    const tcsRate = 2;
    const tcsAmount = Math.round((baseAmount * 0.02) * 100) / 100;
    const totalAmount = Math.round((baseAmount + gstAmount + tcsAmount) * 100) / 100;

    const { Payment } = await import("../payments/payment.model.js");
    const { getNextInvoiceNumber } = await import("../../shared/utils/sequence-generator.js");

    const invoiceNumber = await getNextInvoiceNumber({ chapter: event.chapter });

    const attendeeUser = await User.findById(userId);

    const paymentDoc = await Payment.create({
      invoiceNumber,
      payer: userId,
      eventId: event._id,
      itemType: "Delegation Installment",
      description: `${event.title} - ${inst.title} (Installment #${inst.installmentNumber})`,
      subtotal: baseAmount,
      gstRate: 5,
      gstAmount,
      tcsRate: 2,
      tcsAmount,
      amount: totalAmount,
      currency: "INR",
      method: paymentData.method || "Online Transfer",
      status: "Paid",
      transactionId: paymentData.transactionId || `TXN-DEL-${invoiceNumber}`,
      paidAt: new Date(),
      chapter: event.chapter || "Central",
      state: event.creatorState || "Central",
      isDelegationPayment: true,
      installmentNumber: inst.installmentNumber,
      installmentTitle: inst.title,
      payerName: attendeeUser?.name || "Delegate",
      payerEmail: attendeeUser?.email || "",
      payerPhone: attendeeUser?.phone || "",
      notes: `Delegation Installment #${inst.installmentNumber} (Base: ₹${baseAmount} + 5% GST: ₹${gstAmount} + 2% TCS: ₹${tcsAmount})`,
    });

    // Revenue Sharing: this installment is event revenue (eventId set, 100% to whichever
    // chapter/state organized the event) — non-fatal, logged, never blocks the
    // installment payment the delegate is actively completing.
    try {
      await revenueShareService.createLedgerEntriesForPayment(paymentDoc, { event, actor: { id: userId } });
    } catch (revShareErr) {
      logger.error(`[REVENUE SHARE] Failed to create ledger entries for payment ${paymentDoc._id}:`, revShareErr);
    }

    inst.status = "Paid";
    inst.paymentId = String(paymentDoc._id);
    inst.invoiceNumber = paymentDoc.invoiceNumber;
    inst.paidAt = new Date();
    inst.method = paymentDoc.method;
    inst.totalAmount = totalAmount;
    inst.gstAmount = gstAmount;
    inst.tcsAmount = tcsAmount;

    registration.amountPaid = (Number(registration.amountPaid) || 0) + totalAmount;
    const allPaid = registration.installments.every((i) => i.status === "Paid");
    registration.paymentStatus = allPaid ? "Paid" : "Partially Paid";

    await event.save();

    // Fire confirmation notification and email
    setImmediate(async () => {
      try {
        await notificationService.createNotification({
          recipientId: userId,
          type: "Payment",
          title: `Installment #${inst.installmentNumber} Paid & Invoice Generated`,
          body: `Payment of ₹${totalAmount} (incl. 5% GST & 2% TCS) for "${event.title}" confirmed. Invoice #${paymentDoc.invoiceNumber} is available.`,
          link: "/admin/payments",
          metadata: {
            invoiceNumber: paymentDoc.invoiceNumber,
            eventId: event._id,
            installmentNumber: inst.installmentNumber,
          },
        });

        if (attendeeUser?.email) {
          await emailService.sendEventRegistrationEmail({
            email: attendeeUser.email,
            userName: attendeeUser.name,
            eventTitle: `${event.title} - ${inst.title}`,
            eventDate: inst.dueDate,
            location: event.venue || event.city || "Delegation Itinerary",
            ticketType: `Delegation Installment #${inst.installmentNumber}`,
            isPaid: true,
            ticketPrice: totalAmount,
            paymentId: paymentDoc._id,
            transactionId: paymentDoc.transactionId,
            chapter: event.chapter || "",
            invoiceNumber: paymentDoc.invoiceNumber,
          });
        }
      } catch (err) {
        console.error("Failed to send installment payment confirmation:", err);
      }
    });

    return { event, installment: inst, payment: paymentDoc };
  },

  /**
   * Check and send automated reminders for Delegation Event installments:
   * 1. 1 day prior to Installment Due
   * 2. Immediately when Installment is due (on due date)
   * 3. Each day until not paid (overdue)
   */
  async checkDelegationInstallmentReminders() {
    try {
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const todayTime = new Date(todayStr).getTime();

      const delegationEvents = await Event.find({
        $or: [{ eventCategory: "Delegation" }, { isDelegation: true }],
        "registeredUsers.installments.status": "Pending",
      }).populate("registeredUsers.user", "name email phone");

      for (const event of delegationEvents) {
        let eventModified = false;

        for (const reg of event.registeredUsers || []) {
          const user = reg.user;
          if (!user || !user.email) continue;

          for (const inst of reg.installments || []) {
            if (inst.status !== "Pending" || !inst.dueDate) continue;

            const dueTime = new Date(inst.dueDate).getTime();
            if (isNaN(dueTime)) continue;

            // Difference in calendar days
            const diffDays = Math.round((dueTime - todayTime) / (1000 * 60 * 60 * 24));

            if (!inst.remindersSent) {
              inst.remindersSent = {
                prior1Day: { sent: false, sentAt: null },
                dueImmediate: { sent: false, sentAt: null },
                dailyOverdueCount: 0,
                lastOverdueSentAt: null,
              };
            }

            let shouldSend = false;
            let reminderType = "";

            if (diffDays === 1 && !inst.remindersSent.prior1Day?.sent) {
              // 1 day prior to Installment Due
              shouldSend = true;
              reminderType = "prior_1_day";
              inst.remindersSent.prior1Day = { sent: true, sentAt: new Date() };
              eventModified = true;
            } else if (diffDays === 0 && !inst.remindersSent.dueImmediate?.sent) {
              // Immediately when Installment is due (today)
              shouldSend = true;
              reminderType = "due_today";
              inst.remindersSent.dueImmediate = { sent: true, sentAt: new Date() };
              eventModified = true;
            } else if (diffDays < 0) {
              // Each day until not paid (Overdue)
              const lastSent = inst.remindersSent.lastOverdueSentAt;
              const alreadySentToday = lastSent && new Date(lastSent).toISOString().split("T")[0] === todayStr;

              if (!alreadySentToday) {
                shouldSend = true;
                reminderType = "overdue";
                inst.remindersSent.lastOverdueSentAt = new Date();
                inst.remindersSent.dailyOverdueCount = (inst.remindersSent.dailyOverdueCount || 0) + 1;
                eventModified = true;
              }
            }

            if (shouldSend) {
              const totalAmount = inst.totalAmount || Math.round((inst.baseAmount * 1.07) * 100) / 100;
              const notificationTitle =
                reminderType === "prior_1_day"
                  ? `Reminder: Delegation Installment #${inst.installmentNumber} Due Tomorrow`
                  : reminderType === "due_today"
                    ? `Action Required: Delegation Installment #${inst.installmentNumber} Due Today`
                    : `Overdue Notice: Delegation Installment #${inst.installmentNumber} Pending`;

              const notificationBody =
                reminderType === "prior_1_day"
                  ? `Installment #${inst.installmentNumber} (₹${totalAmount}) for "${event.title}" is due tomorrow (${inst.dueDate}).`
                  : reminderType === "due_today"
                    ? `Installment #${inst.installmentNumber} (₹${totalAmount}) for "${event.title}" is due today! Please complete your payment.`
                    : `Installment #${inst.installmentNumber} (₹${totalAmount}) for "${event.title}" was due on ${inst.dueDate}. Please clear your payment immediately.`;

              // Send in-app notification
              try {
                await notificationService.createNotification({
                  recipientId: user._id || user.id,
                  type: "Event",
                  title: notificationTitle,
                  body: notificationBody,
                  entityId: event._id,
                  link: `/events/${event.slug || event._id}`,
                  metadata: {
                    eventId: event._id,
                    installmentNumber: inst.installmentNumber,
                    dueDate: inst.dueDate,
                    totalAmount,
                    reminderType,
                  },
                });
              } catch (notifErr) {
                console.error("Failed to send in-app reminder notification:", notifErr);
              }

              // Send reminder email
              try {
                await emailService.sendDelegationInstallmentReminderEmail({
                  email: user.email,
                  userName: user.name,
                  eventTitle: event.title,
                  installmentNumber: inst.installmentNumber,
                  installmentTitle: inst.title,
                  dueDate: inst.dueDate,
                  baseAmount: inst.baseAmount,
                  gstAmount: inst.gstAmount,
                  tcsAmount: inst.tcsAmount,
                  totalAmount,
                  reminderType,
                  eventId: event.slug || event._id,
                });
              } catch (mailErr) {
                console.error("Failed to send reminder email:", mailErr);
              }
            }
          }
        }

        if (eventModified) {
          await event.save();
        }
      }
    } catch (err) {
      console.error("[EventScheduler] Error checking delegation installment reminders:", err);
    }
  },
};
