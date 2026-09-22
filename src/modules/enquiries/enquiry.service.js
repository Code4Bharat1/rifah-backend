import { Enquiry } from "./enquiry.model.js";
import { Business } from "../businesses/business.model.js";
import { User } from "../users/user.model.js";
import { notificationService } from "../notifications/notification.service.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { generateReferenceId } from "../../shared/utils/generate-id.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, ForbiddenError, BadRequestError } from "../../shared/errors/errors.js";
import { ROLES } from "../../shared/constants/roles.js";
import { getChapterFilter, resolveChapterIdForLocation, resolveChapterIdByName } from "../../shared/utils/chapter-scope.js";
import { Chapter } from "../chapters/chapter.model.js";

export const enquiryService = {
  /**
   * Create a new Buyer enquiry / RFQ
   */
  createEnquiry: async (data, user) => {
    let referenceId = generateReferenceId("ENQ", 4);
    while (await Enquiry.findOne({ referenceId })) {
      referenceId = generateReferenceId("ENQ", 4);
    }

    const initialTimeline = [
      { label: "Enquiry submitted", at: "Just now", done: true },
      { label: "Routing to matching businesses", at: "Pending", done: false },
      { label: "Business responses", at: "Pending", done: false },
      { label: "Enquiry closed", at: "Pending", done: false },
    ];

    const isCustomerOrGuest = !user || user.role === "customer" || user.role === "user";
    let targetType = data.targetType || (data.targetBusiness ? "business" : (data.chapter && data.chapter !== "All Chapters" ? "chamber" : "all"));
    let targetBusiness = data.targetBusiness;

    if (isCustomerOrGuest) {
      // Allow direct business enquiries from the profile page for guests;
      // all other guest/customer enquiries go through Chamber Admin routing.
      if (data.targetType === "business" && data.targetBusiness) {
        targetType = "business";
        // targetBusiness already set above
      } else {
        targetType = data.targetType === "chamber" ? "chamber" : "all";
        targetBusiness = undefined;
      }
    }

    let userBusiness = null;
    if (user) {
      userBusiness = await Business.findOne({ owner: user.id });
    }

    let requesterRole = "Guest Customer";
    let requesterName = data.guestName || data.name || "Customer";
    if (user) {
      if (user.role === "business" || userBusiness) {
        requesterRole = "Business Member";
        requesterName = userBusiness?.name || user.name || "Business Member";
      } else if (user.role === "customer") {
        requesterRole = "Verified Customer";
        requesterName = (user.name && !user.name.toLowerCase().includes("buyer account")) ? user.name : "Customer";
      } else {
        requesterRole = "Registered Customer";
        requesterName = user.name || "Customer";
      }
    }

    // Resolve the owning chapter for this enquiry: explicit chamber-targeting is trusted directly;
    // otherwise derive it from the buyer's delivery location so it only reaches that chapter's admin.
    let resolvedChapter;
    let resolvedChapterId = null;
    if (targetType === "chamber" && data.chapter) {
      resolvedChapter = data.chapter;
      resolvedChapterId = await resolveChapterIdByName(data.chapter);
    } else {
      resolvedChapterId = await resolveChapterIdForLocation(data.location);
      if (resolvedChapterId) {
        const matchedChapter = await Chapter.findById(resolvedChapterId);
        resolvedChapter = matchedChapter.name;
      } else {
        resolvedChapter = targetType === "all" ? (data.chapter || "All Chapters") : (data.chapter || "Unassigned");
      }
    }

    // Explicit classification of enquiry source:
    // 1. "b2b": Sent by an authenticated business member
    // 2. "guest": Sent without login directly to a specific business
    // 3. "general": Sent via homepage RFQ / public broadcast
    let sourceType = data.sourceType;
    if (!sourceType || !["b2b", "guest", "general"].includes(sourceType)) {
      if (user && (user.role === "business" || userBusiness)) {
        sourceType = "b2b";
      } else if (!user && targetType === "business") {
        sourceType = "guest";
      } else {
        sourceType = "general";
      }
    }

    const enquiry = await Enquiry.create({
      ...data,
      referenceId,
      targetType,
      sourceType,
      targetBusiness,
      requester: user ? user.id : null,
      requesterName,
      requesterRole,
      guestName: data.guestName || (user ? user.name : "") || "",
      guestEmail: data.guestEmail || (user ? user.email : "") || "",
      guestPhone: data.guestPhone || (user ? user.phone : "") || "",
      timeline: initialTimeline,
      chapter: resolvedChapter,
      chapterId: resolvedChapterId,
    });

    if (targetType === "business" && targetBusiness) {
      try {
        const targetBiz = await Business.findById(targetBusiness);
        if (targetBiz?.owner) {
          await notificationService.createNotification({
            recipientId: targetBiz.owner,
            type: "Enquiry",
            title: "New Direct Enquiry",
            body: `New requirement "${enquiry.title}" received from ${enquiry.requesterName}.`,
            entityId: enquiry._id,
            link: "/biz/enquiries",
          });

          let targetEmail = null;
          let ownerName = targetBiz.name;

          if (targetBiz.owner) {
            const ownerUser = await User.findById(targetBiz.owner);
            if (ownerUser?.email) {
              targetEmail = ownerUser.email;
              ownerName = ownerUser.name;
            }
          }

          if (!targetEmail && targetBiz.email) {
            targetEmail = targetBiz.email;
          }

          if (targetEmail) {
            await emailService.sendNewEnquiryEmail({
              email: targetEmail,
              businessOwnerName: ownerName,
              businessName: targetBiz.name,
              enquiryTitle: enquiry.title,
              category: enquiry.category,
              quantity: enquiry.quantity,
              budget: enquiry.budget,
              location: enquiry.location || enquiry.city,
              buyerName: enquiry.requesterName || enquiry.guestName || "Prospective Buyer",
              buyerEmail: enquiry.guestEmail || (user?.email) || "",
              buyerPhone: enquiry.guestPhone || (user?.phone) || "",
              description: enquiry.description,
            });
          }

          const { leadService } = await import("../leads/lead.service.js");
          leadService.routeEnquiryToBusinesses(enquiry._id.toString(), [data.targetBusiness.toString()]).catch(err => {
            console.error("Direct lead routing background task failed:", err);
          });
        }
      } catch (err) { }
    } else if (targetType === "chamber" || targetType === "all") {
      try {
        const { Settings } = await import("../settings/settings.model.js");
        const settings = await Settings.findOne({ isSingleton: "global" });
        const autoRoute = settings ? settings.autoRouteLeadsByCategory : true;

        if (autoRoute && data.category) {
          const query = {
            status: { $in: ["Live", "Active"] },
            categories: data.category,
            ...(userBusiness ? { _id: { $ne: userBusiness._id } } : {}),
          };

          // Restrict to chapter only when explicitly targeting a single chamber
          if (targetType === "chamber" && resolvedChapterId) {
            query.chapterId = resolvedChapterId;
          }

          const matchingBusinesses = await Business.find(query);

          if (matchingBusinesses.length > 0) {
            const businessIds = matchingBusinesses.map(b => b._id.toString());
            const { leadService } = await import("../leads/lead.service.js");
            leadService.routeEnquiryToBusinesses(enquiry._id.toString(), businessIds).catch(err => {
              console.error("Auto routing background task failed:", err);
            });

            enquiry.timeline = enquiry.timeline.map(t =>
              t.label === "Routing to matching businesses"
                ? { label: `Automatically routed to ${matchingBusinesses.length} matching businesses`, at: "Just now", done: true }
                : t
            );
            await enquiry.save();
          }
        }
      } catch (err) {
        console.error("Failed to auto-route leads:", err);
      }
    }

    return enquiry;
  },

  /**
   * Get single enquiry by ID or Reference ID
   */
  getEnquiryById: async (identifier, user) => {
    const isObjectId = identifier.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: identifier } : { referenceId: identifier };

    const enquiry = await Enquiry.findOne(query)
      .populate("requester", "name email phone")
      .populate("targetBusiness", "name slug chapter city phone owner");

    if (!enquiry) {
      throw new NotFoundError("Enquiry not found");
    }

    if (user) {
      const isRequester = String(enquiry.requester?._id || enquiry.requester || "") === String(user.id);
      const isTargetOwner = String(enquiry.targetBusiness?.owner || "") === String(user.id);
      const isAdmin = ["central_admin", "state_admin", "chapter_admin"].includes(user.role);

      let hasRoutedLead = false;
      if (!isRequester && !isTargetOwner && !isAdmin) {
        const { Lead } = await import("../leads/lead.model.js");
        const { Business } = await import("../businesses/business.model.js");
        const userBusiness = await Business.findOne({ owner: user.id });
        if (userBusiness) {
          const leadExists = await Lead.exists({ enquiry: enquiry._id, business: userBusiness._id });
          if (leadExists) hasRoutedLead = true;
        }
      }

      if (!isRequester && !isTargetOwner && !isAdmin && !hasRoutedLead) {
        throw new ForbiddenError("You are not authorized to view this enquiry");
      }
    }

    return enquiry;
  },

  /**
   * List enquiries submitted by current buyer
   */
  listBuyerEnquiries: async (userId, queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = { requester: userId };

    if (queryParams.status && queryParams.status !== "undefined" && queryParams.status !== "null" && queryParams.status.toLowerCase() !== "all") {
      if (queryParams.status.toLowerCase() === "submitted" || queryParams.status.toLowerCase() === "new") {
        filter.status = { $in: ["New", "Submitted"] };
      } else {
        filter.status = new RegExp(`^${queryParams.status}$`, "i");
      }
    }

    const [enquiries, total] = await Promise.all([
      Enquiry.find(filter)
        .populate("targetBusiness", "name slug chapter")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Enquiry.countDocuments(filter),
    ]);

    return {
      enquiries,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * List direct and chamber/pan-chamber enquiries accessible to current business
   */
  listBusinessEnquiries: async (userId, queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const userBusiness = await Business.findOne({ owner: userId });
    if (!userBusiness) {
      return { enquiries: [], meta: buildPaginationMeta(0, page, limit) };
    }

    const { Lead } = await import("../leads/lead.model.js");

    // Fetch existing leads for this business
    const userLeads = await Lead.find({ business: userBusiness._id });
    const userLeadMap = new Map();
    userLeads.forEach((l) => {
      if (l.enquiry) {
        userLeadMap.set(l.enquiry.toString(), l);
      }
    });
    const routedEnquiryIds = Array.from(userLeadMap.keys());

    const bizCategories = [
      ...(Array.isArray(userBusiness.categories) ? userBusiness.categories : []),
      userBusiness.industry,
    ].filter(Boolean);

    const categoryCondition = bizCategories.length > 0
      ? { category: { $in: bizCategories } }
      : {};

    // Build filter matching:
    // 1. Direct enquiries to this business (targetBusiness === userBusiness._id) - includes B2B Direct & Guest Direct
    // 2. Enquiries explicitly routed to this business by admin/lead routing (_id in routedEnquiryIds)
    // 3. Chamber-specific enquiries matching this business's chapter
    // 4. Pan-Chamber B2B enquiries from fellow chamber members
    // 5. General RFQs from public buyers matching business category
    // STRICT RULE: Exclude user's own posted enquiries (which belong in My Enquiries)
    const filter = {
      $and: [
        { requester: { $ne: userId } },
        {
          $or: [
            { targetBusiness: userBusiness._id },
            { _id: { $in: routedEnquiryIds } },
            { targetType: "chamber", chapterId: userBusiness.chapterId },
            { targetType: "all", sourceType: "b2b" },
            {
              targetType: "all",
              sourceType: { $ne: "b2b" },
              ...categoryCondition,
            },
            { targetType: { $exists: false }, targetBusiness: userBusiness._id },
          ],
        },
      ],
    };

    if (queryParams.status && queryParams.status !== "undefined" && queryParams.status !== "null" && queryParams.status.toLowerCase() !== "all") {
      filter.$and.push({ status: new RegExp(`^${queryParams.status}$`, "i") });
    }

    if (queryParams.search) {
      filter.$and.push({
        $or: [
          { title: { $regex: queryParams.search, $options: "i" } },
          { referenceId: { $regex: queryParams.search, $options: "i" } },
          { requesterName: { $regex: queryParams.search, $options: "i" } },
          { category: { $regex: queryParams.search, $options: "i" } },
        ],
      });
    }

    const [enquiries, total] = await Promise.all([
      Enquiry.find(filter)
        .populate("requester", "name email phone avatar")
        .populate("targetBusiness", "name slug chapter")
        .sort(sort || { createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Enquiry.countDocuments(filter),
    ]);

    // Only associate an existing Lead record if one was genuinely routed or already created.
    // Do NOT auto-create leads for broadcast enquiries; leads are created only when the business explicitly responds or quotes.
    const enrichedEnquiries = enquiries.map((enq) => {
      const enqObj = enq.toObject ? enq.toObject() : { ...enq };
      const lead = userLeadMap.get(enq._id.toString());
      const hasValidQuotation = Boolean(lead?.quotation?.amount && Number(lead.quotation.amount) > 0);
      enqObj.leadId = lead?._id ? lead._id.toString() : null;
      enqObj.leadStatus = hasValidQuotation
        ? (lead?.status || "Responded")
        : (lead?.status || enq.status || "New");
      enqObj.myQuotation = hasValidQuotation ? lead.quotation : null;
      enqObj.isMarketplace =
        (enq.targetType === "all" || enq.targetType === "chamber") &&
        !lead &&
        String(enq.targetBusiness?._id || enq.targetBusiness || "") !== String(userBusiness._id);
      return enqObj;
    });

    return {
      enquiries: enrichedEnquiries,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * List all enquiries chamber-wide (Admin)
   */
  listAllEnquiries: async (queryParams = {}, requester = null) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};
    const conditions = [];

    // RBAC: Chapter Admin Scope Enforcement
    if (requester && requester.role === ROLES.CHAPTER_ADMIN) {
      if (!requester.chapterId) {
        conditions.push({ _id: null }); // Deny access
      } else {
        const businesses = await Business.find({ chapterId: requester.chapterId }).select("_id");
        const businessIds = businesses.map((b) => b._id);

        conditions.push({
          $or: [
            { chapterId: requester.chapterId },
            { targetBusiness: { $in: businessIds } }
          ]
        });
      }
    } else if (requester && requester.role === ROLES.STATE_ADMIN) {
      let stateName = requester.state;
      if (!stateName && requester.id) {
        const userDoc = await User.findById(requester.id).select("state");
        stateName = userDoc?.state;
      }

      const orConditions = [{ assignedTo: requester.id }];

      if (stateName) {
        const stateRegex = new RegExp(`^${stateName.trim()}$`, "i");
        const stateChapters = await Chapter.find({ state: stateRegex }).select("_id name");
        const chapterIds = stateChapters.map((c) => c._id);
        const chapterNames = stateChapters.map((c) => c.name);
        const businesses = await Business.find({
          $or: [
            { chapterId: { $in: chapterIds } },
            { state: stateRegex }
          ]
        }).select("_id");
        const businessIds = businesses.map((b) => b._id);

        orConditions.push(
          { chapterId: { $in: chapterIds } },
          { chapter: { $in: chapterNames } },
          { targetBusiness: { $in: businessIds } },
          { location: stateRegex }
        );
      }

      conditions.push({ $or: orConditions });
    }

    if (queryParams.status && queryParams.status.toLowerCase() !== "all") {
      conditions.push({ status: queryParams.status });
    }
    if (queryParams.category) {
      conditions.push({ category: queryParams.category });
    }

    // Type Filter (Direct RFQs vs Broadcast RFQs)
    if (queryParams.type && queryParams.type.toLowerCase() !== "all") {
      if (queryParams.type === "direct") {
        conditions.push({ targetBusiness: { $exists: true, $ne: null } });
      } else if (queryParams.type === "broadcast") {
        conditions.push({ targetBusiness: { $exists: false } });
      }
    }

    // Chapter Filter
    if (queryParams.chapter && queryParams.chapter.toLowerCase() !== "all") {
      // If Chapter Admin, they can only search their own chapter which is enforced by RBAC
      if (!requester || requester.role !== ROLES.CHAPTER_ADMIN) {
        conditions.push({ chapter: queryParams.chapter });
      }
    }

    if (queryParams.search) {
      conditions.push({
        $or: [
          { title: { $regex: queryParams.search, $options: "i" } },
          { referenceId: { $regex: queryParams.search, $options: "i" } },
          { requesterName: { $regex: queryParams.search, $options: "i" } },
        ]
      });
    }

    if (conditions.length > 0) {
      filter.$and = conditions;
    }

    const [enquiries, total] = await Promise.all([
      Enquiry.find(filter)
        .populate("requester", "name email phone")
        .populate("targetBusiness", "name slug chapter")
        .populate("assignedTo", "name email role state")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Enquiry.countDocuments(filter),
    ]);

    return {
      enquiries,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Update enquiry status, assignment & timeline
   */
  updateEnquiryStatus: async (id, { status, assignedTo, resolutionNote, timelineUpdate }, requester) => {
    const chapterScope = await getChapterFilter(requester, 'direct_id');
    const enquiry = await Enquiry.findOne({ _id: id, ...chapterScope });
    if (!enquiry) {
      throw new NotFoundError("Enquiry not found or access denied");
    }

    const oldStatus = enquiry.status;
    const oldAssignedTo = enquiry.assignedTo ? String(enquiry.assignedTo) : null;
    if (status) enquiry.status = status;
    if (assignedTo !== undefined) enquiry.assignedTo = assignedTo;
    if (resolutionNote !== undefined) enquiry.resolutionNote = resolutionNote;

    if (timelineUpdate) {
      enquiry.timeline.push(timelineUpdate);
    }
    await enquiry.save();

    // Notify assigned admin if newly assigned
    if (assignedTo && String(assignedTo) !== oldAssignedTo) {
      try {
        await notificationService.createNotification({
          recipientId: assignedTo,
          type: "Enquiry",
          title: "New Enquiry Assigned",
          body: `You have been assigned an enquiry: "${enquiry.title}".`,
          entityId: enquiry._id,
          link: "/admin/enquiries",
        });
      } catch (err) {
        console.error("Failed to notify assigned admin:", err);
      }
    }

    // Notify customer on status change
    if (oldStatus !== status && enquiry.requester) {
      try {
        let title, body;
        if (status === "Routed") {
          title = "Enquiry Approved";
          body = `Your requirement "${enquiry.title}" has been approved and routed to matching businesses.`;
        } else if (status === "Closed" || status === "Rejected") {
          title = `Enquiry ${status}`;
          body = `Your requirement "${enquiry.title}" has been ${status.toLowerCase()}.`;
        }

        if (title && body) {
          await notificationService.createNotification({
            recipientId: enquiry.requester,
            type: "Enquiry",
            title,
            body,
            entityId: enquiry._id,
            link: "/biz/my-enquiries"
          });
        }
      } catch (err) {
        console.error("Failed to notify customer on enquiry status change:", err);
      }
    }

    return enquiry;
  },

  /**
   * Escalate a chapter-owned enquiry to Head Office (Chapter Admin only, own chapter only)
   */
  escalateEnquiry: async (id, requester, note) => {
    const enquiry = await Enquiry.findById(id);
    if (!enquiry) {
      throw new NotFoundError("Enquiry not found");
    }

    if (!requester.chapterId || String(enquiry.chapterId || "") !== String(requester.chapterId)) {
      throw new ForbiddenError("You can only escalate leads that belong to your own chapter");
    }

    if (enquiry.status === "Escalated") {
      throw new BadRequestError("This lead has already been escalated");
    }

    enquiry.status = "Escalated";
    enquiry.escalatedAt = new Date();
    enquiry.escalatedBy = requester.id;
    if (note !== undefined) enquiry.resolutionNote = note;
    enquiry.timeline.push({ label: `Escalated to Head Office by chapter admin`, at: "Just now", done: true });
    await enquiry.save();

    try {
      const headOfficeUsers = await User.find({ role: ROLES.CENTRAL_ADMIN }).select("_id");
      await Promise.all(
        headOfficeUsers.map((admin) =>
          notificationService.createNotification({
            recipientId: admin._id,
            type: "Enquiry",
            title: "Lead Escalated",
            body: `A lead ("${enquiry.title}") was escalated from ${enquiry.chapter} for Head Office routing.`,
            entityId: enquiry._id,
            link: "/admin/leads",
          })
        )
      );
    } catch (err) {
      console.error("Failed to notify Head Office about escalation:", err);
    }

    return enquiry;
  },

  /**
   * Export Enquiries to CSV
   */
  exportCsv: async (queryParams = {}, requester = null) => {
    const filter = {};
    const conditions = [];

    // RBAC: Chapter Admin Scope Enforcement
    if (requester && requester.role === ROLES.CHAPTER_ADMIN) {
      if (!requester.chapterId) {
        conditions.push({ _id: null }); // Deny access
      } else {
        const businesses = await Business.find({ chapterId: requester.chapterId }).select("_id");
        const businessIds = businesses.map((b) => b._id);

        conditions.push({
          $or: [
            { chapterId: requester.chapterId },
            { targetBusiness: { $in: businessIds } }
          ]
        });
      }
    }

    if (queryParams.status && queryParams.status.toLowerCase() !== "all") {
      conditions.push({ status: queryParams.status });
    }
    if (queryParams.category) {
      conditions.push({ category: queryParams.category });
    }

    // Type Filter (Direct RFQs vs Broadcast RFQs)
    if (queryParams.type && queryParams.type.toLowerCase() !== "all") {
      if (queryParams.type === "direct") {
        conditions.push({ targetBusiness: { $exists: true, $ne: null } });
      } else if (queryParams.type === "broadcast") {
        conditions.push({ targetBusiness: { $exists: false } });
      }
    }

    // Chapter Filter
    if (queryParams.chapter && queryParams.chapter.toLowerCase() !== "all") {
      if (!requester || requester.role !== ROLES.CHAPTER_ADMIN) {
        conditions.push({ chapter: queryParams.chapter });
      }
    }

    if (queryParams.search) {
      conditions.push({
        $or: [
          { title: { $regex: queryParams.search, $options: "i" } },
          { referenceId: { $regex: queryParams.search, $options: "i" } },
          { requesterName: { $regex: queryParams.search, $options: "i" } },
        ]
      });
    }

    if (conditions.length > 0) {
      filter.$and = conditions;
    }

    const enquiries = await Enquiry.find(filter)
      .populate("targetBusiness", "name")
      .sort({ createdAt: -1 });

    // Build CSV string manually
    const headers = [
      "Reference ID",
      "Title",
      "Category",
      "Type",
      "Buyer Name",
      "Target Location",
      "Quantity",
      "Budget",
      "Status",
      "Date Created"
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const safeStr = String(str).replace(/"/g, '""');
      return `"${safeStr}"`;
    };

    const rows = enquiries.map(e => [
      escapeCsv(e.referenceId),
      escapeCsv(e.title),
      escapeCsv(e.category),
      escapeCsv(e.targetBusiness ? "Direct RFQ" : "Broadcast RFQ"),
      escapeCsv(e.requesterName || e.buyerName || "Registered Buyer"),
      escapeCsv(e.city || e.location),
      escapeCsv(e.quantity),
      escapeCsv(e.budget),
      escapeCsv(e.status),
      escapeCsv(e.createdAt.toISOString().split("T")[0])
    ].join(","));

    return [headers.join(","), ...rows].join("\n");
  },
};
