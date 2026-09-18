import { PowerRequirement, PowerConnection } from "./power-networking.model.js";
import { Business } from "../businesses/business.model.js";
import { Catalogue } from "../catalogue/catalogue.model.js";
import { User } from "../users/user.model.js";
import { notificationService } from "../notifications/notification.service.js";
import { messageService } from "../messages/message.service.js";
import { emitToUser } from "../../infrastructure/socket/socket.js";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../shared/errors/errors.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";

/**
 * Normalizes text to lowercase alphanumeric tokens
 */
function tokenize(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Canonical 100-point normalized matching score algorithm
 * Max Score = 100:
 * - Product / Service match: 40 pts
 * - Catalogue item match: 30 pts
 * - Category match: 20 pts
 * - Location / Chapter relevance: 10 pts
 */
function calculateMatchingScore({ requirement, business, catalogueItems = [] }) {
  let score = 0;
  const reasons = [];

  const reqKeywords = tokenize(`${requirement.productService} ${requirement.title} ${requirement.description}`);
  const reqCategory = (requirement.category || "").toLowerCase().trim();
  const reqLocTokens = tokenize(`${requirement.location} ${requirement.preferredLocation}`);

  // 1. Product / Service Match (Max 40)
  const bizProductsServices = [
    ...(business.productsSummary || []),
    ...(business.servicesSummary || []),
    business.name,
    business.tagline,
    business.about,
  ].join(" ");
  const bizTokens = tokenize(bizProductsServices);

  const matchedProdTokens = reqKeywords.filter((k) => bizTokens.includes(k));
  if (matchedProdTokens.length > 0) {
    const prodScore = Math.min(40, Math.round((matchedProdTokens.length / Math.max(1, reqKeywords.length)) * 40 + 20));
    score += prodScore;
    reasons.push({
      type: "product_service",
      points: prodScore,
      label: `Matches ${requirement.productService}`,
    });
  }

  // 2. Catalogue Items Match (Max 30)
  const matchedCatalogueItems = [];
  for (const item of catalogueItems) {
    const itemTokens = tokenize(`${item.name} ${item.description} ${item.category}`);
    const hasMatch = reqKeywords.some((k) => itemTokens.includes(k));
    if (hasMatch) {
      matchedCatalogueItems.push(item);
    }
  }

  if (matchedCatalogueItems.length > 0) {
    const catScore = Math.min(30, 20 + matchedCatalogueItems.length * 5);
    score += catScore;
    reasons.push({
      type: "catalogue",
      points: catScore,
      label: `Catalogue: ${matchedCatalogueItems.slice(0, 2).map((i) => i.name).join(", ")}`,
      items: matchedCatalogueItems.map((i) => ({ _id: i._id, name: i.name, type: i.type, price: i.price })),
    });
  }

  // 3. Category Match (Max 20)
  const bizCategories = (business.categories || []).map((c) => String(c).toLowerCase().trim());
  const bizIndustry = (business.industry || "").toLowerCase().trim();
  const categoryMatch =
    bizCategories.includes(reqCategory) ||
    bizIndustry.includes(reqCategory) ||
    bizCategories.some((c) => c.includes(reqCategory) || reqCategory.includes(c));

  if (categoryMatch) {
    score += 20;
    reasons.push({
      type: "category",
      points: 20,
      label: `Category: ${requirement.category}`,
    });
  }

  // 4. Location / Chapter Relevance (Max 10)
  const bizLocTokens = tokenize(`${business.city} ${business.state} ${business.chapter}`);
  const hasLocMatch = reqLocTokens.some((t) => bizLocTokens.includes(t));
  if (hasLocMatch) {
    score += 10;
    reasons.push({
      type: "location",
      points: 10,
      label: `Location: ${business.city || business.chapter || "Region"}`,
    });
  }

  // Normalize strictly between 0 and 100
  const normalizedScore = Math.min(100, Math.max(0, score));

  // Determine relevance tier
  let tier = "Relevant";
  if (normalizedScore >= 70) tier = "Best Match";
  else if (normalizedScore >= 40) tier = "Highly Relevant";

  return {
    score: normalizedScore,
    tier,
    reasons,
    matchedCatalogueItems,
  };
}

export const powerNetworkingService = {
  /**
   * Aggregates real DB statistics for the business
   */
  getDashboardStats: async (businessId) => {
    const [myRequirementsCount, incomingRequestsCount, outgoingRequestsCount, connectedBusinessesCount] = await Promise.all([
      PowerRequirement.countDocuments({ business: businessId, status: "Active" }),
      PowerConnection.countDocuments({ receiverBusiness: businessId, status: "Pending" }),
      PowerConnection.countDocuments({ requesterBusiness: businessId, status: "Pending" }),
      PowerConnection.countDocuments({
        $or: [{ requesterBusiness: businessId }, { receiverBusiness: businessId }],
        status: "Accepted",
      }),
    ]);

    // Calculate actual matching businesses across all active requirements
    const activeRequirements = await PowerRequirement.find({ business: businessId, status: "Active" }).lean();
    let totalUniqueMatches = 0;
    if (activeRequirements.length > 0) {
      const matchSet = new Set();
      for (const req of activeRequirements) {
        const matches = await powerNetworkingService.findMatchesForRequirement(req._id, businessId, { limit: 50 });
        matches.businesses.forEach((b) => matchSet.add(String(b._id)));
      }
      totalUniqueMatches = matchSet.size;
    }

    return {
      myRequirements: myRequirementsCount,
      businessMatches: totalUniqueMatches,
      connectionRequests: incomingRequestsCount + outgoingRequestsCount,
      incomingRequests: incomingRequestsCount,
      outgoingRequests: outgoingRequestsCount,
      connectedBusinesses: connectedBusinessesCount,
    };
  },

  /**
   * Create a new Power Networking Requirement
   */
  createRequirement: async (data, user, businessId) => {
    if (!businessId) {
      throw new BadRequestError("You must have an active business to post a requirement");
    }

    const requirement = await PowerRequirement.create({
      title: data.title,
      category: data.category,
      productService: data.productService,
      quantity: data.quantity,
      requiredBy: data.requiredBy,
      location: data.location || "",
      preferredLocation: data.preferredLocation || "",
      budget: data.budget || "",
      urgency: data.urgency || "Medium",
      description: data.description || "",
      business: businessId,
      createdBy: user?._id || user?.id,
      status: "Active",
    });

    return requirement;
  },

  /**
   * Get all requirements for the current business
   */
  getRequirements: async (businessId, query = {}) => {
    const { page, limit, skip } = parsePagination(query);
    const filter = { business: businessId };
    if (query.status) filter.status = query.status;

    const [requirements, total] = await Promise.all([
      PowerRequirement.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("business", "name slug logo city chapter")
        .lean(),
      PowerRequirement.countDocuments(filter),
    ]);

    // Attach match & connection counts for each requirement
    const enriched = await Promise.all(
      requirements.map(async (req) => {
        const [connectionsCount, matchesResult] = await Promise.all([
          PowerConnection.countDocuments({ requirement: req._id, status: "Accepted" }),
          powerNetworkingService.findMatchesForRequirement(req._id, businessId, { limit: 100 }),
        ]);
        return {
          ...req,
          matchesCount: matchesResult.totalMatches,
          connectionsCount,
        };
      })
    );

    return {
      requirements: enriched,
      pagination: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Get a single requirement by ID
   */
  getRequirementById: async (id, businessId) => {
    const requirement = await PowerRequirement.findById(id)
      .populate("business", "name slug logo city chapter industry")
      .populate("createdBy", "name email phone")
      .lean();

    if (!requirement) {
      throw new NotFoundError("Requirement not found");
    }

    const [connectionsCount, matchesResult] = await Promise.all([
      PowerConnection.countDocuments({ requirement: requirement._id, status: "Accepted" }),
      powerNetworkingService.findMatchesForRequirement(requirement._id, businessId, { limit: 50 }),
    ]);

    return {
      ...requirement,
      matchesCount: matchesResult.totalMatches,
      connectionsCount,
    };
  },

  /**
   * Central Matching Engine for a Requirement
   * Strictly excludes current businessId and non-verified/inactive businesses
   */
  findMatchesForRequirement: async (requirementId, businessId, options = {}) => {
    const requirement = await PowerRequirement.findById(requirementId).lean();
    if (!requirement) {
      throw new NotFoundError("Requirement not found");
    }

    const keywords = tokenize(`${requirement.productService} ${requirement.category} ${requirement.title}`);

    // Eligible businesses: Active & valid, excluding current business
    const businessFilter = {
      _id: { $ne: businessId },
      status: { $nin: ["Suspended", "suspended", "Deleted", "deleted"] },
    };

    // Optional filters passed from frontend search
    if (options.chapter && options.chapter !== "all") {
      businessFilter.chapter = options.chapter;
    }
    if (options.category && options.category !== "all") {
      businessFilter.$or = [{ categories: options.category }, { industry: options.category }];
    }

    // Fetch businesses and existing relationships in parallel
    const [businesses, existingConnections] = await Promise.all([
      Business.find(businessFilter)
        .select("name slug logo tagline about industry categories city state chapter verification isVerified rating productsSummary servicesSummary owner")
        .populate("owner", "name email avatar")
        .lean(),
      PowerConnection.find({
        $or: [{ requesterBusiness: businessId }, { receiverBusiness: businessId }],
        status: { $in: ["Pending", "Accepted"] },
      }).lean(),
    ]);

    // Map existing connections by other business ID
    const connMap = new Map();
    existingConnections.forEach((conn) => {
      const otherBizId = String(conn.requesterBusiness) === String(businessId) ? String(conn.receiverBusiness) : String(conn.requesterBusiness);
      connMap.set(otherBizId, {
        status: conn.status,
        connectionId: conn._id,
      });
    });

    // Fetch catalogue products for all candidate businesses
    const bizIds = businesses.map((b) => b._id);
    const catalogueItems = await Catalogue.find({ business: { $in: bizIds }, status: "Active" }).lean();
    const catalogueMap = new Map();
    catalogueItems.forEach((c) => {
      const bId = String(c.business);
      if (!catalogueMap.has(bId)) catalogueMap.set(bId, []);
      catalogueMap.get(bId).push(c);
    });

    // Score and enrich each business
    const scoredBusinesses = businesses
      .map((biz) => {
        const bId = String(biz._id);
        const bCatalogue = catalogueMap.get(bId) || [];
        const matchResult = calculateMatchingScore({
          requirement,
          business: biz,
          catalogueItems: bCatalogue,
        });

        const connInfo = connMap.get(bId);
        const connectionStatus = connInfo ? connInfo.status : "None";
        const networkStatus = connectionStatus === "Accepted" ? "CONNECTED" : connectionStatus === "Pending" ? "PENDING" : "NOT_CONNECTED";

        return {
          ...biz,
          matchScore: matchResult.score,
          relevanceTier: matchResult.tier,
          matchReasons: matchResult.reasons,
          catalogue: bCatalogue,
          connectionStatus,
          networkStatus,
          connectionId: connInfo ? connInfo.connectionId : null,
        };
      })
      .filter((b) => b.matchScore > 0 || (options.showAll && b.matchScore >= 0))
      .sort((a, b) => {
        // Priority: Connected in Power Network first, then highest match score, then verified, then rating
        if (a.networkStatus === "CONNECTED" && b.networkStatus !== "CONNECTED") return -1;
        if (b.networkStatus === "CONNECTED" && a.networkStatus !== "CONNECTED") return 1;
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        const aVer = a.isVerified || a.verification === "verified" || a.verification === "Verified" ? 1 : 0;
        const bVer = b.isVerified || b.verification === "verified" || b.verification === "Verified" ? 1 : 0;
        if (bVer !== aVer) return bVer - aVer;
        return (b.rating || 0) - (a.rating || 0);
      });

    const page = Number(options.page) || 1;
    const limit = Number(options.limit) || 20;
    const skip = (page - 1) * limit;
    const paginated = scoredBusinesses.slice(skip, skip + limit);

    return {
      requirement,
      businesses: paginated,
      totalMatches: scoredBusinesses.length,
      pagination: buildPaginationMeta(scoredBusinesses.length, page, limit),
    };
  },

  /**
   * Discover Verified & Active Businesses across RIFAH
   */
  discoverBusinesses: async (businessId, query = {}) => {
    const { page, limit, skip } = parsePagination(query);

    const filter = {
      _id: { $ne: businessId },
      status: { $nin: ["Suspended", "suspended", "Deleted", "deleted"] },
    };

    if (query.search) {
      const searchRegex = new RegExp(query.search.trim(), "i");
      filter.$or = [
        { name: searchRegex },
        { industry: searchRegex },
        { categories: searchRegex },
        { tagline: searchRegex },
        { about: searchRegex },
      ];
    }
    if (query.category && query.category !== "all") {
      filter.$or = [{ categories: query.category }, { industry: query.category }];
    }
    if (query.chapter && query.chapter !== "all") {
      filter.chapter = query.chapter;
    }
    if (query.city) {
      filter.city = new RegExp(query.city, "i");
    }
    if (query.state) {
      filter.state = new RegExp(query.state, "i");
    }

    const [businesses, total, existingConnections] = await Promise.all([
      Business.find(filter)
        .sort({ rating: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("name slug logo tagline about industry categories city state chapter verification isVerified rating productsSummary servicesSummary owner")
        .populate("owner", "name email avatar")
        .lean(),
      Business.countDocuments(filter),
      PowerConnection.find({
        $or: [{ requesterBusiness: businessId }, { receiverBusiness: businessId }],
        status: { $in: ["Pending", "Accepted"] },
      }).lean(),
    ]);

    // Attach catalogue items and connection status
    const bizIds = businesses.map((b) => b._id);
    const catalogueItems = await Catalogue.find({ business: { $in: bizIds }, status: "Active" }).lean();
    const catMap = new Map();
    catalogueItems.forEach((c) => {
      const bId = String(c.business);
      if (!catMap.has(bId)) catMap.set(bId, []);
      catMap.get(bId).push(c);
    });

    const connMap = new Map();
    existingConnections.forEach((conn) => {
      const otherBizId = String(conn.requesterBusiness) === String(businessId) ? String(conn.receiverBusiness) : String(conn.requesterBusiness);
      connMap.set(otherBizId, {
        status: conn.status,
        connectionId: conn._id,
      });
    });

    const enriched = businesses.map((biz) => {
      const bId = String(biz._id);
      const connInfo = connMap.get(bId);
      const connectionStatus = connInfo ? connInfo.status : "None";
      const networkStatus = connectionStatus === "Accepted" ? "CONNECTED" : connectionStatus === "Pending" ? "PENDING" : "NOT_CONNECTED";

      return {
        ...biz,
        catalogue: catMap.get(bId) || [],
        connectionStatus,
        networkStatus,
        connectionId: connInfo ? connInfo.connectionId : null,
      };
    });

    return {
      businesses: enriched,
      pagination: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Get My Permanent Power Network (Established Connections)
   */
  getMyPowerNetwork: async (businessId, query = {}) => {
    const { page, limit, skip } = parsePagination(query);

    const connectionFilter = {
      $or: [{ requesterBusiness: businessId }, { receiverBusiness: businessId }],
      status: "Accepted",
    };

    const connections = await PowerConnection.find(connectionFilter)
      .sort({ updatedAt: -1 })
      .populate("requesterBusiness", "name slug logo tagline about industry categories city state chapter verification isVerified rating owner")
      .populate("receiverBusiness", "name slug logo tagline about industry categories city state chapter verification isVerified rating owner")
      .populate("requesterUser", "name email avatar")
      .populate("receiverUser", "name email avatar")
      .lean();

    // Map to connected partner business
    let networkBusinesses = connections.map((conn) => {
      const isRequester = String(conn.requesterBusiness?._id || conn.requesterBusiness) === String(businessId);
      const partnerBiz = isRequester ? conn.receiverBusiness : conn.requesterBusiness;
      const partnerUser = isRequester ? conn.receiverUser : conn.requesterUser;

      if (!partnerBiz) return null;

      return {
        ...partnerBiz,
        connectionId: conn._id,
        connectedAt: conn.updatedAt || conn.createdAt,
        partnerUser,
        networkStatus: "CONNECTED",
      };
    }).filter(Boolean);

    // Filter by search/category/chapter if provided
    if (query.search && query.search.trim()) {
      const s = query.search.toLowerCase().trim();
      networkBusinesses = networkBusinesses.filter((b) =>
        (b.name && b.name.toLowerCase().includes(s)) ||
        (b.industry && b.industry.toLowerCase().includes(s)) ||
        (b.categories && b.categories.some((c) => String(c).toLowerCase().includes(s))) ||
        (b.city && b.city.toLowerCase().includes(s))
      );
    }

    if (query.category && query.category !== "all") {
      const cat = query.category.toLowerCase().trim();
      networkBusinesses = networkBusinesses.filter((b) =>
        (b.industry && b.industry.toLowerCase().includes(cat)) ||
        (b.categories && b.categories.some((c) => String(c).toLowerCase().includes(cat)))
      );
    }

    if (query.chapter && query.chapter !== "all") {
      const ch = query.chapter.toLowerCase().trim();
      networkBusinesses = networkBusinesses.filter((b) =>
        b.chapter && b.chapter.toLowerCase().includes(ch)
      );
    }

    // Attach catalogue items
    const bizIds = networkBusinesses.map((b) => b._id);
    const catalogueItems = await Catalogue.find({ business: { $in: bizIds }, status: "Active" }).lean();
    const catMap = new Map();
    catalogueItems.forEach((c) => {
      const bId = String(c.business);
      if (!catMap.has(bId)) catMap.set(bId, []);
      catMap.get(bId).push(c);
    });

    const total = networkBusinesses.length;
    const paginated = networkBusinesses.slice(skip, skip + limit).map((b) => ({
      ...b,
      catalogue: catMap.get(String(b._id)) || [],
    }));

    return {
      businesses: paginated,
      total,
      pagination: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Remove a Business from Power Network (Disconnect)
   */
  removeFromPowerNetwork: async (connectionId, businessId) => {
    const connection = await PowerConnection.findById(connectionId);
    if (!connection) {
      throw new NotFoundError("Connection not found");
    }

    const isMember =
      String(connection.requesterBusiness) === String(businessId) ||
      String(connection.receiverBusiness) === String(businessId);

    if (!isMember) {
      throw new ForbiddenError("You are not authorized to modify this connection");
    }

    connection.status = "Removed";
    connection.removedAt = new Date();
    connection.removedBy = businessId;
    await connection.save();

    return { success: true, message: "Business removed from your Power Network" };
  },

  /**
   * Send a Quote Request (RFQ) to an established connected partner
   */
  requestQuoteFromPartner: async ({ requesterBusinessId, requesterUserId, targetBusinessId, productService, quantity, requirementId, note, budget, requiredBy }) => {
    // 1. Verify active connection exists
    const connection = await PowerConnection.findOne({
      $or: [
        { requesterBusiness: requesterBusinessId, receiverBusiness: targetBusinessId },
        { requesterBusiness: targetBusinessId, receiverBusiness: requesterBusinessId },
      ],
      status: "Accepted",
    });

    if (!connection) {
      throw new BadRequestError("You can only request a quote from businesses in your Power Network. Please add them first.");
    }

    const [requesterBiz, targetBiz] = await Promise.all([
      Business.findById(requesterBusinessId).lean(),
      Business.findById(targetBusinessId).populate("owner").lean(),
    ]);

    if (!targetBiz || !targetBiz.owner) {
      throw new NotFoundError("Target business or owner not found");
    }

    // 2. Format quote message for direct conversation
    const messageContent = [
      `⚡ [POWER NETWORKING QUOTE REQUEST]`,
      `Product/Service: ${productService}`,
      `Quantity: ${quantity || "As discussed"}`,
      budget ? `Budget: ${budget}` : null,
      requiredBy ? `Required By: ${new Date(requiredBy).toLocaleDateString("en-IN")}` : null,
      note ? `Note: "${note}"` : null,
    ].filter(Boolean).join("\n");

    // 3. Send direct message via message service
    try {
      await messageService.sendMessage(
        {
          recipientId: targetBiz.owner._id,
          text: messageContent,
        },
        requesterUserId
      );
    } catch (e) {
      console.warn("Message dispatch error:", e?.message);
    }

    // 4. Send notification
    try {
      await notificationService.createNotification({
        recipientId: targetBiz.owner._id,
        type: "QuoteRequest",
        title: `⚡ Quote Request from ${requesterBiz.name}`,
        body: `${requesterBiz.name} requested a quote for ${productService} (Qty: ${quantity || "1"}).`,
        entityId: connection._id,
        link: "/biz/messages",
      });
    } catch (e) {
      console.warn("Notification dispatch error:", e?.message);
    }

    return {
      success: true,
      message: "Quotation request sent to partner successfully",
      targetBusiness: targetBiz.name,
    };
  },

  /**
   * Send a Connection Request
   */
  sendConnectionRequest: async ({ requesterBusinessId, requesterUserId, receiverBusinessId, requirementId, message }) => {
    if (String(requesterBusinessId) === String(receiverBusinessId)) {
      throw new BadRequestError("You cannot connect with your own business");
    }

    const [requesterBiz, receiverBiz] = await Promise.all([
      Business.findById(requesterBusinessId).populate("owner"),
      Business.findById(receiverBusinessId).populate("owner"),
    ]);

    if (!requesterBiz) throw new NotFoundError("Requester business not found");
    if (!receiverBiz) throw new NotFoundError("Target business not found");

    if (!receiverBiz.owner) {
      throw new BadRequestError("Target business does not have an active owner account");
    }

    // Check if connection already exists
    const existing = await PowerConnection.findOne({
      $or: [
        { requesterBusiness: requesterBusinessId, receiverBusiness: receiverBusinessId },
        { requesterBusiness: receiverBusinessId, receiverBusiness: requesterBusinessId },
      ],
      status: { $in: ["Pending", "Accepted"] },
    });

    if (existing) {
      if (existing.status === "Accepted") {
        throw new BadRequestError("This business is already in your Power Network");
      }
      if (existing.status === "Pending") {
        throw new BadRequestError("A connection request is already pending with this business");
      }
    }

    const connection = await PowerConnection.create({
      requesterBusiness: requesterBusinessId,
      requesterUser: requesterUserId,
      receiverBusiness: receiverBusinessId,
      receiverUser: receiverBiz.owner._id || receiverBiz.owner,
      requirement: requirementId || null,
      message: message || `Hi ${receiverBiz.name}, we would like to connect with your business on RIFAH Power Networking.`,
      status: "Pending",
    });

    // Notify receiver owner
    try {
      await notificationService.createNotification({
        recipientId: receiverBiz.owner._id || receiverBiz.owner,
        type: "ConnectionRequest",
        title: "⚡ New Power Network Invitation",
        body: `${requesterBiz.name} wants to connect with your business on Power Networking.`,
        entityId: connection._id,
        link: "/biz/power-networking",
      });

      emitToUser(String(receiverBiz.owner._id || receiverBiz.owner), "power_networking_request", {
        connectionId: connection._id,
        requester: requesterBiz.name,
      });
    } catch (e) {
      console.warn("Notification dispatch error:", e?.message);
    }

    return connection;
  },

  /**
   * Accept or Decline a Connection Request
   */
  respondToConnectionRequest: async (connectionId, action, userId, businessId) => {
    const connection = await PowerConnection.findById(connectionId)
      .populate("requesterBusiness", "name owner")
      .populate("receiverBusiness", "name owner")
      .populate("requesterUser", "_id name email")
      .populate("receiverUser", "_id name email");

    if (!connection) {
      throw new NotFoundError("Connection request not found");
    }

    if (String(connection.receiverBusiness._id) !== String(businessId)) {
      throw new ForbiddenError("Only the recipient business can accept or decline this request");
    }

    if (connection.status !== "Pending") {
      throw new BadRequestError(`This request has already been ${connection.status.toLowerCase()}`);
    }

    if (action === "accept") {
      connection.status = "Accepted";
      connection.respondedAt = new Date();
      await connection.save();

      // Notify requester
      try {
        await notificationService.createNotification({
          recipientId: connection.requesterUser._id,
          type: "ConnectionAccepted",
          title: "⚡ Power Network Connection Accepted!",
          body: `${connection.receiverBusiness.name} accepted your connection request. They are now in your Power Network!`,
          entityId: connection._id,
          link: "/biz/power-networking",
        });

        emitToUser(String(connection.requesterUser._id), "power_networking_accepted", {
          connectionId: connection._id,
          receiver: connection.receiverBusiness.name,
        });
      } catch (e) {
        console.warn("Notification dispatch error:", e?.message);
      }
    } else if (action === "decline") {
      connection.status = "Declined";
      connection.respondedAt = new Date();
      await connection.save();
    } else {
      throw new BadRequestError("Invalid action. Must be 'accept' or 'decline'");
    }

    return connection;
  },

  /**
   * Cancel an Outgoing Connection Request
   */
  cancelConnectionRequest: async (connectionId, userId, businessId) => {
    const connection = await PowerConnection.findById(connectionId);
    if (!connection) {
      throw new NotFoundError("Connection request not found");
    }

    if (String(connection.requesterBusiness) !== String(businessId)) {
      throw new ForbiddenError("Only the requester business can cancel this request");
    }

    if (connection.status !== "Pending") {
      throw new BadRequestError("Only pending requests can be cancelled");
    }

    connection.status = "Cancelled";
    await connection.save();

    return { success: true, message: "Connection request cancelled" };
  },

  /**
   * Get Connections
   */
  getConnections: async (businessId, query = {}) => {
    return powerNetworkingService.getMyPowerNetwork(businessId, query);
  },

  /**
   * Get Incoming or Outgoing Connection Requests
   */
  getRequests: async (businessId, query = {}) => {
    const { page, limit, skip } = parsePagination(query);
    const type = query.type || "incoming";

    const filter = {};
    if (type === "incoming") {
      filter.receiverBusiness = businessId;
    } else {
      filter.requesterBusiness = businessId;
    }

    if (query.status) {
      filter.status = query.status;
    } else {
      filter.status = "Pending";
    }

    const [requests, total, incomingCount, outgoingCount] = await Promise.all([
      PowerConnection.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("requesterBusiness", "name slug logo city state chapter industry")
        .populate("receiverBusiness", "name slug logo city state chapter industry")
        .populate("requesterUser", "name email avatar")
        .populate("receiverUser", "name email avatar")
        .populate("requirement", "title category productService quantity requiredBy")
        .lean(),
      PowerConnection.countDocuments(filter),
      PowerConnection.countDocuments({ receiverBusiness: businessId, status: "Pending" }),
      PowerConnection.countDocuments({ requesterBusiness: businessId, status: "Pending" }),
    ]);

    return {
      requests,
      counts: {
        incoming: incomingCount,
        outgoing: outgoingCount,
      },
      pagination: buildPaginationMeta(total, page, limit),
    };
  },
};
