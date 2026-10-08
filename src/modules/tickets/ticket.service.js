import { Ticket } from "./ticket.model.js";
import { Business } from "../businesses/business.model.js";
import { User } from "../users/user.model.js";
import { ROLES } from "../../shared/constants/roles.js";
import { BadRequestError, NotFoundError, ForbiddenError } from "../../shared/errors/errors.js";
import { notificationService } from "../notifications/notification.service.js";

export const ticketService = {
  /**
   * Raise a new support ticket (Business panel)
   * Auto-assigns to the business's own chapter admin queue
   */
  async createTicket(user, data) {
    // 1. Resolve business profile
    let business = null;
    if (user.businessId) {
      business = await Business.findById(user.businessId);
    }
    if (!business) {
      business = await Business.findOne({ owner: user.id });
    }
    if (!business && user.email) {
      business = await Business.findOne({ ownerEmail: user.email.toLowerCase() });
    }
    if (!business && user.email) {
      business = await Business.findOne({ email: user.email.toLowerCase() });
    }

    if (!business) {
      throw new BadRequestError(
        "A registered business profile is required to raise a support ticket. Please create or link your business profile first."
      );
    }

    // 2. Determine chapter and state (fallback to user's chapter/state if blank on business)
    const chapter = (business.chapter || user.chapter || "Chamber Central").trim();
    const state = (business.state || user.state || "Maharashtra").trim();

    // 3. Generate unique sequential ticket number (collision-resistant)
    const year = new Date().getFullYear();
    let ticketNumber = "";
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
      const count = await Ticket.countDocuments();
      const candidate = attempts === 0
        ? `TKT-${year}-${String(count + 1).padStart(4, "0")}`
        : `TKT-${year}-${String(count + 1).padStart(4, "0")}-${Math.floor(1000 + Math.random() * 9000)}`;
      const existing = await Ticket.findOne({ ticketNumber: candidate }).select("_id").lean();
      if (!existing) {
        ticketNumber = candidate;
        isUnique = true;
      }
      attempts++;
    }
    if (!ticketNumber) {
      ticketNumber = `TKT-${year}-${Date.now().toString().slice(-6)}`;
    }

    // 4. Create ticket with automatic routing
    const ticket = new Ticket({
      ticketNumber,
      business: business._id,
      businessName: business.name || "Business Enterprise",
      contactPerson: business.contactPerson || user.name || "Business Owner",
      contactPhone: business.phone || user.phone || "",
      contactEmail: business.email || user.email || "",
      membershipTier: business.membership || "Free",
      chapter,
      state,
      createdBy: user.id,

      category: data.category?.trim() || "General Query",
      priority: data.priority || "Medium",
      subject: data.subject?.trim(),
      description: data.description?.trim(),
      referenceId: data.referenceId?.trim() || "",
      attachments: Array.isArray(data.attachments) ? data.attachments : [],

      status: "Open",
      currentLevel: "CHAPTER", // Auto-routed to Chapter Admin first

      messages: [
        {
          sender: user.id,
          senderName: business.name || user.name || "Business",
          senderRole: "business",
          message: data.description?.trim(),
          attachments: Array.isArray(data.attachments) ? data.attachments : [],
          createdAt: new Date(),
        },
      ],
    });

    await ticket.save();

    // 5. Notify Chapter Admins of this chapter asynchronously
    try {
      const chapterAdmins = await User.find({
        role: ROLES.CHAPTER_ADMIN,
        chapter: { $regex: new RegExp(`^${chapter}$`, "i") },
        status: "Active",
      }).select("_id");

      for (const admin of chapterAdmins) {
        await notificationService.createNotification({
          recipientId: admin._id,
          type: "System",
          title: `New Support Ticket: ${ticket.ticketNumber}`,
          body: `${business.name} submitted a ticket regarding ${ticket.category}.`,
          entityId: String(ticket._id),
          link: `/chapter-admin/tickets/${ticket._id}`,
          metadata: { ticketNumber: ticket.ticketNumber, chapter },
        });
      }
    } catch (notifyErr) {
      // Non-fatal if notification delivery encounters issue
    }

    return ticket;
  },

  /**
   * Get tickets list with role-based scoping and filtering
   */
  async getTickets(user, query = {}) {
    const filter = {};
    const role = (user.role || "").toLowerCase();

    // Scoping by role
    const isCentralAdmin =
      role === ROLES.CENTRAL_ADMIN ||
      role === ROLES.SECRETARIAT ||
      role === "super_admin" ||
      role === "admin";

    // Dynamic chapter/state resolution if missing on user token
    let userChapter = (user.chapter || "").trim();
    let userState = (user.state || "").trim();
    if ((role === ROLES.CHAPTER_ADMIN && !userChapter) || (role === ROLES.STATE_ADMIN && !userState)) {
      const u = await User.findById(user.id).select("chapter chapterId state name").lean();
      if (u) {
        if (!userChapter && u.chapter) userChapter = u.chapter.trim();
        if (!userState && u.state) userState = u.state.trim();
      }
    }

    if (isCentralAdmin) {
      // Central Admin sees all tickets globally
      if (query.chapter && query.chapter !== "all") {
        filter.chapter = new RegExp(`^${query.chapter.trim()}$`, "i");
      }
      if (query.state && query.state !== "all") {
        filter.state = new RegExp(`^${query.state.trim()}$`, "i");
      }
    } else if (role === ROLES.STATE_ADMIN) {
      // State Admin sees tickets within their state
      filter.state = new RegExp(`^${userState}$`, "i");
      if (query.chapter && query.chapter !== "all") {
        filter.chapter = new RegExp(`^${query.chapter.trim()}$`, "i");
      }
    } else if (role === ROLES.CHAPTER_ADMIN) {
      // Chapter Admin strictly sees tickets from their chapter
      filter.chapter = new RegExp(`^${userChapter}$`, "i");
    } else {
      // Business / Member role: strictly sees their own tickets
      const businesses = await Business.find({ owner: user.id }).select("_id");
      const bizIds = businesses.map((b) => b._id);
      if (user.businessId) bizIds.push(user.businessId);

      filter.$or = [
        { createdBy: user.id },
        { business: { $in: bizIds } },
      ];
    }

    // Additional query filters
    if (query.status && query.status !== "all") {
      filter.status = query.status;
    }
    if (query.priority && query.priority !== "all") {
      filter.priority = query.priority;
    }
    if (query.category && query.category !== "all") {
      filter.category = new RegExp(query.category.trim(), "i");
    }
    if (query.currentLevel && query.currentLevel !== "all") {
      filter.currentLevel = query.currentLevel.toUpperCase();
    }
    if (query.search) {
      const s = query.search.trim();
      const sRegex = new RegExp(s, "i");
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { ticketNumber: sRegex },
          { subject: sRegex },
          { businessName: sRegex },
          { category: sRegex },
        ],
      });
    }

    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(query.limit) || 20));
    const skip = (page - 1) * limit;

    const [tickets, totalCount] = await Promise.all([
      Ticket.find(filter)
        .populate("business", "name logo slug verification status rating industry")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Ticket.countDocuments(filter),
    ]);

    // Calculate queue counts for quick badges
    const baseFilter = { ...filter };
    delete baseFilter.status;

    const [openCount, inProgressCount, escalatedStateCount, escalatedCentralCount, resolvedCount] = await Promise.all([
      Ticket.countDocuments({ ...baseFilter, status: "Open" }),
      Ticket.countDocuments({ ...baseFilter, status: "In_Progress" }),
      Ticket.countDocuments({ ...baseFilter, status: "Escalated_To_State" }),
      Ticket.countDocuments({ ...baseFilter, status: "Escalated_To_Central" }),
      Ticket.countDocuments({ ...baseFilter, status: "Resolved" }),
    ]);

    return {
      tickets,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      stats: {
        total: totalCount,
        open: openCount,
        inProgress: inProgressCount,
        escalatedToState: escalatedStateCount,
        escalatedToCentral: escalatedCentralCount,
        escalated: escalatedStateCount + escalatedCentralCount,
        resolved: resolvedCount,
      },
    };
  },

  /**
   * Get ticket details by ID with authorization verification
   */
  async getTicketById(user, ticketId) {
    const ticket = await Ticket.findById(ticketId)
      .populate("business", "name logo slug phone email contactPerson membership verification status industry city state address")
      .populate("createdBy", "name email phone role");

    if (!ticket) {
      throw new NotFoundError("Support ticket not found.");
    }

    // Role verification
    const role = (user.role || "").toLowerCase();
    const isCentralAdmin =
      role === ROLES.CENTRAL_ADMIN ||
      role === ROLES.SECRETARIAT ||
      role === "super_admin" ||
      role === "admin";

    if (!isCentralAdmin) {
      let userChapter = (user.chapter || "").trim();
      let userState = (user.state || "").trim();
      if ((role === ROLES.CHAPTER_ADMIN && !userChapter) || (role === ROLES.STATE_ADMIN && !userState)) {
        const u = await User.findById(user.id).select("chapter chapterId state name").lean();
        if (u) {
          if (!userChapter && u.chapter) userChapter = u.chapter.trim();
          if (!userState && u.state) userState = u.state.trim();
        }
      }

      if (role === ROLES.STATE_ADMIN) {
        if (ticket.state.toLowerCase() !== userState.toLowerCase()) {
          throw new ForbiddenError("You are not authorized to view tickets outside your state.");
        }
      } else if (role === ROLES.CHAPTER_ADMIN) {
        if (ticket.chapter.toLowerCase() !== userChapter.toLowerCase()) {
          throw new ForbiddenError("You are not authorized to view tickets outside your chapter.");
        }
      } else {
        // Business / Creator check
        const isCreator = String(ticket.createdBy?._id || ticket.createdBy) === String(user.id);
        const isOwner = ticket.business && String(ticket.business.owner) === String(user.id);
        if (!isCreator && !isOwner) {
          throw new ForbiddenError("You are not authorized to view this ticket.");
        }
      }
    }

    return ticket;
  },

  /**
   * Add a message / reply to the ticket conversation
   */
  async addMessage(user, ticketId, { message, attachments }) {
    if (!message || !message.trim()) {
      throw new BadRequestError("Message content cannot be blank.");
    }

    const ticket = await this.getTicketById(user, ticketId);

    const role = (user.role || "").toLowerCase();
    let senderRole = "business";
    if (
      role === ROLES.CENTRAL_ADMIN ||
      role === ROLES.SECRETARIAT ||
      role === "super_admin" ||
      role === "admin"
    ) {
      senderRole = "central_admin";
    } else if (role === ROLES.STATE_ADMIN) {
      senderRole = "state_admin";
    } else if (role === ROLES.CHAPTER_ADMIN) {
      senderRole = "chapter_admin";
    }

    let senderName = user.name;
    if (!senderName) {
      const u = await User.findById(user.id).select("name").lean();
      senderName = u?.name || (senderRole === "business" ? ticket.businessName : "Administrator");
    }

    ticket.messages.push({
      sender: user.id,
      senderName,
      senderRole,
      message: message.trim(),
      attachments: Array.isArray(attachments) ? attachments : [],
      createdAt: new Date(),
    });

    // If an admin replies to an Open ticket, advance status to In_Progress
    if (senderRole !== "business" && ticket.status === "Open") {
      ticket.status = "In_Progress";
    }

    await ticket.save();

    // Notify counterpart
    try {
      if (senderRole === "business") {
        // Notify handling admin
        await notificationService.broadcastNotification({
          type: "System",
          title: `Update on Ticket ${ticket.ticketNumber}`,
          body: `${ticket.businessName} posted a response on ${ticket.subject}.`,
          chapter: ticket.chapter,
          targetRole: ticket.currentLevel === "CHAPTER" ? ROLES.CHAPTER_ADMIN : undefined,
          link: `/${ticket.currentLevel.toLowerCase()}-admin/tickets/${ticket._id}`,
        });
      } else {
        // Notify business creator
        await notificationService.createNotification({
          recipientId: ticket.createdBy?._id || ticket.createdBy,
          type: "System",
          title: `Reply on Ticket ${ticket.ticketNumber}`,
          body: `${user.name || "Chamber Administration"} replied to your ticket.`,
          entityId: String(ticket._id),
          link: `/biz/tickets/${ticket._id}`,
        });
      }
    } catch (e) {}

    return ticket;
  },

  /**
   * Escalate ticket: Chapter -> State OR State -> Central
   */
  async escalateTicket(user, ticketId, { reason, handoverNote }) {
    if (!reason || !reason.trim()) {
      throw new BadRequestError("Escalation reason is required.");
    }
    if (!handoverNote || !handoverNote.trim()) {
      throw new BadRequestError("Handover context note is required.");
    }

    const ticket = await this.getTicketById(user, ticketId);
    const role = (user.role || "").toLowerCase();

    let fromLevel = ticket.currentLevel;
    let toLevel = "";

    if (fromLevel === "CHAPTER") {
      if (
        role !== ROLES.CHAPTER_ADMIN &&
        role !== ROLES.STATE_ADMIN &&
        role !== ROLES.CENTRAL_ADMIN &&
        role !== "super_admin"
      ) {
        throw new ForbiddenError("Only Chapter Administrators can escalate tickets to the State level.");
      }
      toLevel = "STATE";
      ticket.currentLevel = "STATE";
      ticket.status = "Escalated_To_State";
    } else if (fromLevel === "STATE") {
      if (
        role !== ROLES.STATE_ADMIN &&
        role !== ROLES.CENTRAL_ADMIN &&
        role !== "super_admin"
      ) {
        throw new ForbiddenError("Only State Administrators can escalate tickets to the Central level.");
      }
      toLevel = "CENTRAL";
      ticket.currentLevel = "CENTRAL";
      ticket.status = "Escalated_To_Central";
    } else {
      throw new BadRequestError("This ticket is already at the highest escalation level (Central Admin).");
    }

    let escalatedByName = user.name;
    if (!escalatedByName) {
      const u = await User.findById(user.id).select("name").lean();
      escalatedByName = u?.name || (role === ROLES.CHAPTER_ADMIN ? "Chapter Admin" : role === ROLES.STATE_ADMIN ? "State Admin" : "Administrator");
    }

    ticket.escalations.push({
      fromLevel,
      toLevel,
      escalatedBy: user.id,
      escalatedByName,
      reason: reason.trim(),
      handoverNote: handoverNote.trim(),
      escalatedAt: new Date(),
    });

    // Add system timeline event to messages
    ticket.messages.push({
      sender: user.id,
      senderName: escalatedByName,
      senderRole: role === ROLES.CHAPTER_ADMIN ? "chapter_admin" : "state_admin",
      message: `[ESCALATED TO ${toLevel} ADMIN] Reason: ${reason.trim()} | Note: ${handoverNote.trim()}`,
      attachments: [],
      createdAt: new Date(),
    });

    await ticket.save();

    // Notify higher tier administrators
    try {
      if (toLevel === "STATE") {
        const stateAdmins = await User.find({
          role: ROLES.STATE_ADMIN,
          state: { $regex: new RegExp(`^${ticket.state}$`, "i") },
          status: "Active",
        }).select("_id");

        for (const sa of stateAdmins) {
          await notificationService.createNotification({
            recipientId: sa._id,
            type: "System",
            title: `Escalated Ticket Alert: ${ticket.ticketNumber}`,
            body: `${ticket.chapter} escalated ${ticket.businessName}'s ticket: ${reason}.`,
            entityId: String(ticket._id),
            link: `/state-admin/tickets/${ticket._id}`,
          });
        }
      } else if (toLevel === "CENTRAL") {
        const centralAdmins = await User.find({
          role: { $in: [ROLES.CENTRAL_ADMIN, ROLES.SECRETARIAT, "super_admin"] },
          status: "Active",
        }).select("_id");

        for (const ca of centralAdmins) {
          await notificationService.createNotification({
            recipientId: ca._id,
            type: "System",
            title: `Central Escalation: ${ticket.ticketNumber}`,
            body: `${ticket.state} state escalated ticket from ${ticket.businessName}.`,
            entityId: String(ticket._id),
            link: `/admin/tickets/${ticket._id}`,
          });
        }
      }
    } catch (e) {}

    return ticket;
  },

  /**
   * Resolve ticket (Admin action)
   */
  async resolveTicket(user, ticketId, { resolutionNote }) {
    if (!resolutionNote || !resolutionNote.trim()) {
      throw new BadRequestError("Resolution summary note is required.");
    }

    const ticket = await this.getTicketById(user, ticketId);
    const role = (user.role || "").toLowerCase();

    const isAdmin =
      role === ROLES.CHAPTER_ADMIN ||
      role === ROLES.STATE_ADMIN ||
      role === ROLES.CENTRAL_ADMIN ||
      role === ROLES.SECRETARIAT ||
      role === "super_admin" ||
      role === "admin";

    if (!isAdmin) {
      throw new ForbiddenError("Only authorized chamber administrators can resolve support tickets.");
    }

    let resolvedByName = user.name;
    if (!resolvedByName) {
      const u = await User.findById(user.id).select("name").lean();
      resolvedByName = u?.name || "Chamber Administrator";
    }

    ticket.status = "Resolved";
    ticket.resolution = {
      resolvedBy: user.id,
      resolvedByName,
      resolvedAt: new Date(),
      resolutionNote: resolutionNote.trim(),
    };

    ticket.messages.push({
      sender: user.id,
      senderName: resolvedByName,
      senderRole: role === ROLES.CHAPTER_ADMIN ? "chapter_admin" : role === ROLES.STATE_ADMIN ? "state_admin" : "central_admin",
      message: `[ISSUE RESOLVED] ${resolutionNote.trim()}`,
      attachments: [],
      createdAt: new Date(),
    });

    await ticket.save();

    // Notify ticket creator business
    try {
      await notificationService.createNotification({
        recipientId: ticket.createdBy?._id || ticket.createdBy,
        type: "System",
        title: `Ticket Resolved: ${ticket.ticketNumber}`,
        body: `Your ticket has been marked resolved: "${resolutionNote.trim()}".`,
        entityId: String(ticket._id),
        link: `/biz/tickets/${ticket._id}`,
      });
    } catch (e) {}

    return ticket;
  },

  /**
   * Close ticket (Final confirmation by business or central admin)
   */
  async closeTicket(user, ticketId) {
    const ticket = await this.getTicketById(user, ticketId);
    ticket.status = "Closed";
    await ticket.save();
    return ticket;
  },
};

export default ticketService;
