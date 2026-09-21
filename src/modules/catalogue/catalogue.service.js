import { Catalogue } from "./catalogue.model.js";
import { Business } from "../businesses/business.model.js";
import { Settings } from "../settings/settings.model.js";
import { generateSlug } from "../../shared/utils/generate-id.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, ForbiddenError } from "../../shared/errors/errors.js";
import { escapeRegex } from "../../middleware/sanitize.middleware.js";

async function ensureSeedCatalogue() {
  try {
    const count = await Catalogue.countDocuments();
    if (count > 5) return;

    const businesses = await Business.find({}).limit(30);
    if (!businesses || businesses.length === 0) return;

    const itemsToInsert = [];
    for (const biz of businesses) {
      // Check if business already has catalogue items
      const existing = await Catalogue.countDocuments({ business: biz._id });
      if (existing > 0) continue;

      const bizName = biz.name || "Business";
      const ind = biz.industry || "General";
      const city = biz.city || biz.chapter || "Mumbai";

      if (ind.toLowerCase().includes("tech") || ind.toLowerCase().includes("it") || ind.toLowerCase().includes("software")) {
        itemsToInsert.push({
          name: `${bizName} Cloud ERP & SaaS Suite`,
          slug: `${biz.slug || generateSlug(bizName)}-cloud-erp`,
          business: biz._id,
          type: "Product",
          category: ind,
          city: city,
          price: "₹35,000 / year",
          moq: "1 Licence",
          description: "Comprehensive ERP software for invoice management, supply chain tracking, and GST reporting.",
          status: "Active",
        });
        itemsToInsert.push({
          name: "Full-Stack Web & Mobile App Development",
          slug: `${biz.slug || generateSlug(bizName)}-app-dev`,
          business: biz._id,
          type: "Service",
          category: ind,
          city: city,
          price: "On Request",
          moq: "1 Project",
          description: "Custom digital platforms, Next.js web applications, and iOS/Android mobile solutions.",
          status: "Active",
        });
      } else if (ind.toLowerCase().includes("auto") || ind.toLowerCase().includes("electric") || ind.toLowerCase().includes("wire") || ind.toLowerCase().includes("manufactur")) {
        itemsToInsert.push({
          name: "High-Grade Automotive Wiring Harness",
          slug: `${biz.slug || generateSlug(bizName)}-wiring-harness`,
          business: biz._id,
          type: "Product",
          category: ind,
          city: city,
          price: "₹2,400 / unit",
          moq: "50 Units",
          description: "Flame-retardant, high-temperature automotive copper wiring harness for commercial & EV vehicles.",
          status: "Active",
        });
        itemsToInsert.push({
          name: "Electrical Harness Testing & Custom Assembly",
          slug: `${biz.slug || generateSlug(bizName)}-testing-assembly`,
          business: biz._id,
          type: "Service",
          category: ind,
          city: city,
          price: "On Request",
          moq: "Batch of 100",
          description: "Automated electrical resistance & continuity testing, crimping, and custom loom design.",
          status: "Active",
        });
      } else if (ind.toLowerCase().includes("education") || ind.toLowerCase().includes("train") || ind.toLowerCase().includes("edtech")) {
        itemsToInsert.push({
          name: "Comprehensive Professional Foundation Course",
          slug: `${biz.slug || generateSlug(bizName)}-foundation-course`,
          business: biz._id,
          type: "Service",
          category: ind,
          city: city,
          price: "₹25,000 / seat",
          moq: "1 Registration",
          description: "Interactive structured curriculum with certified faculty, mock assessments, and personalized mentorship.",
          status: "Active",
        });
        itemsToInsert.push({
          name: "Digital Study Modules & Learning Kits",
          slug: `${biz.slug || generateSlug(bizName)}-learning-kits`,
          business: biz._id,
          type: "Product",
          category: ind,
          city: city,
          price: "₹3,999 / kit",
          moq: "1 Kit",
          description: "Comprehensive handbook, self-paced interactive video modules, and problem-solving guides.",
          status: "Active",
        });
      } else {
        itemsToInsert.push({
          name: `${bizName} Commercial Supply & Distribution`,
          slug: `${biz.slug || generateSlug(bizName)}-commercial-supply`,
          business: biz._id,
          type: "Product",
          category: ind,
          city: city,
          price: "₹1,200 / unit",
          moq: "20 Units",
          description: "Wholesale delivery, certified quality compliance, and doorstep B2B fulfillment across chapters.",
          status: "Active",
        });
        itemsToInsert.push({
          name: `${bizName} Consulting & Client Services`,
          slug: `${biz.slug || generateSlug(bizName)}-consulting-service`,
          business: biz._id,
          type: "Service",
          category: ind,
          city: city,
          price: "On Request",
          moq: "1 Contract",
          description: "Expert advisory, tailored project execution, and specialized industry consultation.",
          status: "Active",
        });
      }
    }

    if (itemsToInsert.length > 0) {
      await Catalogue.insertMany(itemsToInsert);
    }
  } catch (err) {
    console.error("[CATALOGUE SEED ERROR]", err);
  }
}

export const catalogueService = {
  /**
   * Search / Browse public catalogue
   */
  searchCatalogue: async (queryParams = {}) => {
    await ensureSeedCatalogue();
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const andClauses = [{ status: { $ne: "Archived" } }];

    // 1. Keyword search (Item name, description, category or matching business)
    const searchTerm = queryParams.search || queryParams.q;
    if (searchTerm && typeof searchTerm === "string" && searchTerm.trim()) {
      const safeSearch = escapeRegex(searchTerm.trim());
      const matchingBiz = await Business.find({
        $or: [
          { name: { $regex: safeSearch, $options: "i" } },
          { industry: { $regex: safeSearch, $options: "i" } },
          { tagline: { $regex: safeSearch, $options: "i" } },
          { city: { $regex: safeSearch, $options: "i" } },
          { state: { $regex: safeSearch, $options: "i" } },
          { chapter: { $regex: safeSearch, $options: "i" } },
        ],
      }).select("_id");
      const matchedBizIds = matchingBiz.map((b) => b._id);

      andClauses.push({
        $or: [
          { name: { $regex: safeSearch, $options: "i" } },
          { description: { $regex: safeSearch, $options: "i" } },
          { category: { $regex: safeSearch, $options: "i" } },
          ...(matchedBizIds.length > 0 ? [{ business: { $in: matchedBizIds } }] : []),
        ],
      });
    }

    // 2. Type Filter (Product / Service / Merged Offerings)
    if (
      queryParams.type &&
      typeof queryParams.type === "string" &&
      !["all", "all offerings", "both", "offerings"].includes(queryParams.type.toLowerCase().trim())
    ) {
      const typeStr = escapeRegex(queryParams.type.trim());
      andClauses.push({ type: { $regex: new RegExp(`^${typeStr}`, "i") } });
    }

    // 3. Category / Industry / SubCategory Filter
    const targetCategory = queryParams.subCategory || queryParams.industry || queryParams.category;
    if (
      targetCategory &&
      typeof targetCategory === "string" &&
      !["all", "all industries", "all categories"].includes(targetCategory.toLowerCase().trim())
    ) {
      const safeCat = escapeRegex(targetCategory.trim());
      const matchingBizByCat = await Business.find({
        $or: [
          { industry: { $regex: safeCat, $options: "i" } },
          { categories: { $regex: safeCat, $options: "i" } },
          { subCategory: { $regex: safeCat, $options: "i" } },
        ],
      }).select("_id");
      const catBizIds = matchingBizByCat.map((b) => b._id);

      andClauses.push({
        $or: [
          { category: { $regex: safeCat, $options: "i" } },
          ...(catBizIds.length > 0 ? [{ business: { $in: catBizIds } }] : []),
        ],
      });
    }

    // 4. Location Filter (State / Chapter / City)
    const targetLocation = queryParams.chapter || queryParams.city || queryParams.state;
    if (
      targetLocation &&
      typeof targetLocation === "string" &&
      !["all", "all locations", "all chapters", "all states"].includes(targetLocation.toLowerCase().trim())
    ) {
      const rawLoc = targetLocation.replace(/\b(chapter|chamber)\b/gi, "").trim();
      const safeLoc = escapeRegex(rawLoc);
      if (safeLoc) {
        const matchingBusinesses = await Business.find({
          $or: [
            { city: { $regex: safeLoc, $options: "i" } },
            { chapter: { $regex: safeLoc, $options: "i" } },
            { state: { $regex: safeLoc, $options: "i" } },
          ],
        }).select("_id");
        const bizIds = matchingBusinesses.map((b) => b._id);

        andClauses.push({
          $or: [
            { city: { $regex: safeLoc, $options: "i" } },
            ...(bizIds.length > 0 ? [{ business: { $in: bizIds } }] : []),
          ],
        });
      }
    }

    if (queryParams.businessId && typeof queryParams.businessId === "string") {
      andClauses.push({ business: queryParams.businessId.trim() });
    }

    const filter = andClauses.length > 1 ? { $and: andClauses } : andClauses[0];

    const [items, total] = await Promise.all([
      Catalogue.find(filter)
        .populate("business", "name slug chapter city rating verification isVerified verificationStatus membership industry")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Catalogue.countDocuments(filter),
    ]);

    return {
      items,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * List catalogue items for a specific business
   */
  listByBusiness: async (businessId) => {
    return Catalogue.find({ business: businessId, status: "Active" });
  },

  /**
   * Record a view on a catalogue item (Public Buyer View)
   */
  recordItemView: async (itemId) => {
    return Catalogue.findByIdAndUpdate(itemId, { $inc: { views: 1 } }, { new: true });
  },

  /**
   * Create catalogue item (Business Owner)
   * Enforces maxCatalogueItems and maxImagesPerItem from global Settings.
   */
  createItem: async (data, user) => {
    const business = await Business.findById(data.businessId || user.businessId);
    if (!business) {
      throw new NotFoundError("Associated business not found");
    }

    if (String(business.owner) !== String(user.id)) {
      throw new ForbiddenError("You do not own this business");
    }

    // --- Enforce plan-based limits ---
    const tier = (business.membership || "Free").toLowerCase();
    const tierCatalogueLimits = {
      free: 2,
      basic: 5,
      premium: 25,
      enterprise: 100,
    };
    const globalSettings = await Settings.findOne({ isSingleton: "global" });
    const maxItems = tierCatalogueLimits[tier] || (globalSettings?.maxCatalogueItems ?? 50);
    const maxImages = globalSettings?.maxImagesPerItem ?? 5;

    const currentCount = await Catalogue.countDocuments({ business: business._id });
    if (currentCount >= maxItems) {
      throw new ForbiddenError(`Catalogue limit reached for ${business.membership || "Free"} plan. Maximum ${maxItems} items allowed. Please upgrade your plan for higher catalogue capacity.`);
    }

    if (data.images && Array.isArray(data.images) && data.images.length > maxImages) {
      throw new ForbiddenError(`Too many images. Maximum ${maxImages} images allowed per item.`);
    }

    const slug = generateSlug(data.name);

    return Catalogue.create({
      ...data,
      slug,
      business: business._id,
      city: business.city,
    });
  },

  /**
   * Update catalogue item
   */
  updateItem: async (id, updateData, user) => {
    const item = await Catalogue.findById(id).populate("business");
    if (!item) {
      throw new NotFoundError("Catalogue item not found");
    }

    const isOwner = String(item.business?.owner) === String(user.id);
    const isAdmin = user.role === "central_admin";

    if (!isOwner && !isAdmin) {
      throw new ForbiddenError("Unauthorized to update this item");
    }

    const ALLOWED_ITEM_FIELDS = [
      "name", "description", "price", "type", "category",
      "city", "moq", "images", "status"
    ];

    const sanitizedData = {};
    for (const key of ALLOWED_ITEM_FIELDS) {
      if (updateData[key] !== undefined) {
        sanitizedData[key] = updateData[key];
      }
    }

    if (sanitizedData.name && sanitizedData.name !== item.name) {
      sanitizedData.slug = generateSlug(sanitizedData.name);
    }

    const updated = await Catalogue.findByIdAndUpdate(id, sanitizedData, {
      new: true,
      runValidators: true,
    });
    return updated;
  },

  /**
   * Delete catalogue item
   */
  deleteItem: async (id, user) => {
    const item = await Catalogue.findById(id).populate("business");
    if (!item) {
      throw new NotFoundError("Catalogue item not found");
    }

    const isOwner = String(item.business.owner) === String(user.id);
    const isAdmin = user.role === "central_admin";

    if (!isOwner && !isAdmin) {
      throw new ForbiddenError("Unauthorized to delete this item");
    }

    await Catalogue.findByIdAndDelete(id);
    return true;
  },
};
