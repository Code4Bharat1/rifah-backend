import { Advertisement } from "./advertisement.model.js";
import { Business } from "../businesses/business.model.js";
import { Chapter } from "../chapters/chapter.model.js";
import { businessService } from "../businesses/business.service.js";
import { ROLES } from "../../shared/constants/roles.js";
import { BadRequestError, NotFoundError, ForbiddenError } from "../../shared/errors/errors.js";
import { resolveChapterIdByName } from "../../shared/utils/chapter-scope.js";

function escapeRegex(text = "") {
  return String(text).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

export const advertisementService = {
  /**
   * Create and submit a new advertisement for verification.
   * Target Scope: 'chapter' | 'state' | 'global'
   */
  createAdvertisement: async (data, user) => {
    const userId = user?.id || user?._id;
    if (!userId) {
      throw new BadRequestError("Authenticated user information is missing.");
    }

    // 1. Resolve user's business (supports businessId in body, token, or owner lookup)
    let business = null;
    if (data.businessId || user.businessId) {
      business = await Business.findById(data.businessId || user.businessId);
    }
    if (!business && userId) {
      business = await businessService.getBusinessByOwnerId(userId);
    }
    if (!business && userId) {
      business = await Business.findOne({ owner: userId });
    }

    if (!business) {
      throw new BadRequestError("You must have a registered business to create an advertisement.");
    }

    // 2. Resolve Chapter
    let chapterId = business.chapterId || user.chapterId;
    if (!chapterId && business.chapter) {
      chapterId = await resolveChapterIdByName(business.chapter);
    }
    if (!chapterId && user.chapter) {
      chapterId = await resolveChapterIdByName(user.chapter);
    }

    let chapter = null;
    if (chapterId) {
      chapter = await Chapter.findById(chapterId);
    }
    const chapterName = chapter ? chapter.name : business.chapter || user.chapter || "RIFAH Chapter";

    // 3. Resolve State (from business, chapter, or user)
    const state = (business.state || chapter?.state || user.state || "").trim();

    // 4. Validate Target Scope
    const targetScope = ["chapter", "state", "global"].includes(data.targetScope)
      ? data.targetScope
      : "chapter";

    if (targetScope === "chapter" && !chapterId) {
      throw new BadRequestError("Your business must be assigned to a RIFAH chapter to advertise at chapter level.");
    }

    if (targetScope === "state" && !state) {
      throw new BadRequestError("Your business must belong to a State to advertise at state level.");
    }

    const requestedDate = data.requestedDate ? new Date(data.requestedDate) : new Date();

    const ad = await Advertisement.create({
      title: data.title,
      description: data.description || "",
      bannerImage: data.bannerImage,
      linkUrl: data.linkUrl || "",
      targetScope: targetScope,
      state: state,
      businessId: business._id,
      businessName: business.businessName || business.name || "Member Enterprise",
      userId: userId,
      chapterId: chapterId || null,
      chapterName: chapterName,
      requestedDate: requestedDate,
      status: "Pending",
    });

    return ad;
  },

  /**
   * Get active advertisements for the current user's view (Global + State + Chapter).
   * Automatically expires past ads and promotes scheduled/queued ads.
   */
  getActiveAdvertisements: async (user = null) => {
    const now = new Date();

    // 1. Mark any active ads whose approvedEndDate has passed as "Completed"
    await Advertisement.updateMany(
      {
        status: "Active",
        approvedEndDate: { $lt: now },
      },
      {
        $set: { status: "Completed" },
      }
    );

    // 2. Helper to find current active ad or promote the next queued ad for a specific scope
    const findOrActivateForScope = async (scopeFilter) => {
      let activeAd = await Advertisement.findOne({
        ...scopeFilter,
        status: "Active",
        approvedStartDate: { $lte: now },
        approvedEndDate: { $gte: now },
      }).populate("businessId", "businessName logo slug city state category");

      if (activeAd) {
        return activeAd;
      }

      const nextAd = await Advertisement.findOne({
        ...scopeFilter,
        status: { $in: ["Approved", "Queued"] },
        approvedStartDate: { $lte: now },
        approvedEndDate: { $gte: now },
      })
        .sort({ queuePosition: 1, approvedStartDate: 1 })
        .populate("businessId", "businessName logo slug city state category");

      if (nextAd) {
        nextAd.status = "Active";
        await nextAd.save();
        return nextAd;
      }

      return null;
    };

    // 3. Resolve viewer's chapter and state context
    let userChapterId = user?.chapterId ? String(user.chapterId) : null;
    let userState = user?.state ? String(user.state).trim() : null;

    if (!userChapterId && user?.chapter) {
      const resolved = await resolveChapterIdByName(user.chapter);
      if (resolved) userChapterId = String(resolved);
    }

    if ((!userChapterId || !userState) && user?.businessId) {
      const biz = await Business.findById(user.businessId).select("chapterId chapter state");
      if (!userChapterId && biz?.chapterId) userChapterId = String(biz.chapterId);
      if (!userState && biz?.state) userState = String(biz.state).trim();
    }

    if (!userChapterId || !userState) {
      const userId = user?.id || user?._id;
      if (userId) {
        const biz = await Business.findOne({ owner: userId }).select("chapterId chapter state");
        if (biz) {
          if (!userChapterId && biz.chapterId) userChapterId = String(biz.chapterId);
          if (!userState && biz.state) userState = String(biz.state).trim();
        }
      }
    }

    if (!userState && userChapterId) {
      const ch = await Chapter.findById(userChapterId);
      if (ch?.state) userState = String(ch.state).trim();
    }

    // 4. Fetch active ads for each applicable scope
    const activeAds = [];

    // Scope A: Global
    const globalAd = await findOrActivateForScope({ targetScope: "global" });
    if (globalAd) activeAds.push(globalAd);

    // Scope B: State (if viewer's state is known)
    if (userState) {
      const stateAd = await findOrActivateForScope({
        targetScope: "state",
        state: new RegExp(`^${escapeRegex(userState)}$`, "i"),
      });
      if (stateAd) activeAds.push(stateAd);
    }

    // Scope C: Chapter (if viewer's chapter is known)
    if (userChapterId) {
      const chapterAd = await findOrActivateForScope({
        targetScope: "chapter",
        chapterId: userChapterId,
      });
      if (chapterAd) activeAds.push(chapterAd);
    }

    return activeAds;
  },

  /**
   * Backward-compatible helper returning single active ad or null
   */
  getActiveAdvertisement: async (user = null) => {
    const ads = await advertisementService.getActiveAdvertisements(user);
    return ads.length > 0 ? ads[0] : null;
  },

  /**
   * List all advertisements submitted by the current business user
   */
  getMyAdvertisements: async (user) => {
    const userId = user?.id || user?._id;
    return Advertisement.find({ userId: userId })
      .sort({ createdAt: -1 })
      .populate("businessId", "businessName logo slug");
  },

  /**
   * Unified Admin Query:
   * Supports Chapter Admin, State Admin, and Central Admin
   */
  getAdminAdvertisements: async (user, query = {}) => {
    const filter = {};

    // 1. Role-specific filtering
    if (user.role === ROLES.CHAPTER_ADMIN) {
      let chapterId = user.chapterId;
      if (!chapterId && user.chapter) {
        chapterId = await resolveChapterIdByName(user.chapter);
      }
      if (!chapterId) {
        throw new ForbiddenError("Chapter Admin account is not linked to a chapter.");
      }
      filter.targetScope = "chapter";
      filter.chapterId = chapterId;
    } else if (user.role === ROLES.STATE_ADMIN) {
      const state = user.state;
      if (!state) {
        throw new ForbiddenError("State Admin account is not linked to a state.");
      }
      filter.targetScope = "state";
      filter.state = new RegExp(`^${escapeRegex(state)}$`, "i");
    } else if (user.role === ROLES.CENTRAL_ADMIN) {
      // Central Admin can filter by scope or view global by default
      if (query.targetScope && query.targetScope !== "all") {
        filter.targetScope = query.targetScope;
      }
      if (query.chapterId) {
        filter.chapterId = query.chapterId;
      }
      if (query.state) {
        filter.state = new RegExp(`^${escapeRegex(query.state)}$`, "i");
      }
    }

    // 2. Status filter
    if (query.status) {
      filter.status = query.status;
    }

    return Advertisement.find(filter)
      .sort({ createdAt: -1 })
      .populate("businessId", "businessName logo slug ownerName phone state")
      .populate("reviewedBy", "name email");
  },

  /**
   * Backward-compatible alias for Chapter Admin list
   */
  getChapterAdvertisements: async (user, query = {}) => {
    return advertisementService.getAdminAdvertisements(user, query);
  },

  /**
   * Review an advertisement: Approve (setting duration) or Reject with remarks.
   * Validates authority according to targetScope.
   */
  reviewAdvertisement: async (id, reviewData, user) => {
    const ad = await Advertisement.findById(id);
    if (!ad) {
      throw new NotFoundError("Advertisement not found.");
    }

    const isCentralAdmin = user.role === ROLES.CENTRAL_ADMIN;

    // Check authority based on ad scope
    if (ad.targetScope === "chapter") {
      let userChapterId = user.chapterId;
      if (!userChapterId && user.chapter) {
        userChapterId = await resolveChapterIdByName(user.chapter);
      }
      const isAdminsChapter = user.role === ROLES.CHAPTER_ADMIN && userChapterId && String(userChapterId) === String(ad.chapterId);
      if (!isAdminsChapter && !isCentralAdmin) {
        throw new ForbiddenError("You can only verify advertisements submitted to your chapter.");
      }
    } else if (ad.targetScope === "state") {
      const isAdminsState = user.role === ROLES.STATE_ADMIN && user.state && String(user.state).toLowerCase() === String(ad.state).toLowerCase();
      if (!isAdminsState && !isCentralAdmin) {
        throw new ForbiddenError("You can only verify advertisements submitted to your state.");
      }
    } else if (ad.targetScope === "global") {
      if (!isCentralAdmin) {
        throw new ForbiddenError("Only Central Admin can verify global platform advertisements.");
      }
    }

    const action = String(reviewData.action || "").toUpperCase();
    const reviewerId = user?.id || user?._id;

    if (action === "REJECT") {
      ad.status = "Rejected";
      ad.adminRemarks = reviewData.adminRemarks || "Rejected by Administrator";
      ad.reviewedBy = reviewerId;
      ad.reviewedAt = new Date();
      await ad.save();
      return ad;
    }

    if (action === "APPROVE") {
      const durationDays = Math.max(1, parseInt(reviewData.durationDays, 10) || 1);

      // Determine slot start date
      let startDate = reviewData.approvedStartDate
        ? new Date(reviewData.approvedStartDate)
        : new Date(ad.requestedDate);

      // Normalize to midnight UTC / day boundary
      startDate.setHours(0, 0, 0, 0);

      // If requested date is in past, start today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (startDate < today) {
        startDate = today;
      }

      const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000 - 1000);

      // Expire any active ads whose approvedEndDate has passed
      await Advertisement.updateMany(
        {
          status: "Active",
          approvedEndDate: { $lt: new Date() },
        },
        {
          $set: { status: "Completed" },
        }
      );

      // Check slot overlap strictly within this ad's scope and entity
      const overlapQuery = {
        _id: { $ne: ad._id },
        targetScope: ad.targetScope || "chapter",
        status: { $in: ["Active", "Approved", "Queued"] },
        approvedStartDate: { $lte: endDate },
        approvedEndDate: { $gte: startDate },
      };

      if (ad.targetScope === "chapter") {
        overlapQuery.chapterId = ad.chapterId;
      } else if (ad.targetScope === "state") {
        overlapQuery.state = new RegExp(`^${escapeRegex(ad.state)}$`, "i");
      }
      // If global, no extra entity filter needed

      const overlappingAd = await Advertisement.findOne(overlapQuery);

      const now = new Date();
      const isRunningNow = startDate <= now && endDate >= now;

      if (!overlappingAd && isRunningNow) {
        ad.status = "Active";
        ad.queuePosition = 0;
      } else {
        ad.status = "Queued";
        // Calculate next queue position within this scope
        const queueFilter = { status: "Queued", targetScope: ad.targetScope || "chapter" };
        if (ad.targetScope === "chapter") queueFilter.chapterId = ad.chapterId;
        else if (ad.targetScope === "state") queueFilter.state = ad.state;

        const maxQueueAd = await Advertisement.findOne(queueFilter).sort({ queuePosition: -1 });
        ad.queuePosition = (maxQueueAd?.queuePosition || 0) + 1;
      }

      ad.approvedStartDate = startDate;
      ad.approvedEndDate = endDate;
      ad.durationDays = durationDays;
      ad.adminRemarks = reviewData.adminRemarks || "Approved by Administrator";
      ad.reviewedBy = reviewerId;
      ad.reviewedAt = new Date();

      await ad.save();
      return ad;
    }

    throw new BadRequestError("Invalid action. Must be APPROVE or REJECT.");
  },

  /**
   * Calendar slots for a given scope with privacy masking:
   * Other businesses only see "Booked already" without private ad details.
   */
  getCalendarSlots: async (month, year, targetScope = "chapter", user = null) => {
    const targetYear = parseInt(year, 10) || new Date().getFullYear();
    const targetMonth = parseInt(month, 10) || new Date().getMonth() + 1; // 1-indexed

    const startOfMonth = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0);
    const endOfMonth = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    const scope = ["chapter", "state", "global"].includes(targetScope) ? targetScope : "chapter";

    const query = {
      targetScope: scope,
      status: { $in: ["Active", "Approved", "Queued"] },
      approvedStartDate: { $lte: endOfMonth },
      approvedEndDate: { $gte: startOfMonth },
    };

    let userChapterId = user?.chapterId ? String(user.chapterId) : null;
    let userState = user?.state ? String(user.state).trim() : null;

    if (!userChapterId && user?.chapter) {
      const resolved = await resolveChapterIdByName(user.chapter);
      if (resolved) userChapterId = String(resolved);
    }

    if ((!userChapterId || !userState) && user?.businessId) {
      const biz = await Business.findById(user.businessId).select("chapterId chapter state");
      if (!userChapterId && biz?.chapterId) userChapterId = String(biz.chapterId);
      if (!userState && biz?.state) userState = String(biz.state).trim();
    }

    if (!userState && userChapterId) {
      const ch = await Chapter.findById(userChapterId);
      if (ch?.state) userState = String(ch.state).trim();
    }

    if (scope === "chapter" && userChapterId) {
      query.chapterId = userChapterId;
    } else if (scope === "state" && userState) {
      query.state = new RegExp(`^${escapeRegex(userState)}$`, "i");
    }

    const ads = await Advertisement.find(query);

    const isCentralAdmin = user?.role === ROLES.CENTRAL_ADMIN;
    const isChapterAdmin = user?.role === ROLES.CHAPTER_ADMIN;
    const isStateAdmin = user?.role === ROLES.STATE_ADMIN;
    const currentUserId = user?.id || user?._id ? String(user.id || user._id) : null;

    return ads.map((ad) => {
      const isOwner = currentUserId && String(ad.userId) === currentUserId;
      const isScopeAdmin =
        isCentralAdmin ||
        (isChapterAdmin && userChapterId && String(ad.chapterId) === userChapterId) ||
        (isStateAdmin && userState && String(ad.state).toLowerCase() === String(userState).toLowerCase());

      if (isOwner || isScopeAdmin) {
        return {
          id: ad._id,
          title: ad.title,
          businessName: ad.businessName,
          status: ad.status,
          date: ad.approvedStartDate,
          endDate: ad.approvedEndDate,
          durationDays: ad.durationDays,
          targetScope: ad.targetScope,
          chapterName: ad.chapterName,
          state: ad.state,
          isMine: isOwner,
          isAvailable: false,
        };
      }

      // Privacy Masking for others
      return {
        id: `masked-${ad._id}`,
        title: "Booked already",
        businessName: "RIFAH Member",
        status: "Booked",
        date: ad.approvedStartDate,
        endDate: ad.approvedEndDate,
        durationDays: ad.durationDays,
        targetScope: ad.targetScope,
        chapterName: "",
        state: "",
        isMine: false,
        isAvailable: false,
      };
    });
  },

  /**
   * Delete an advertisement
   */
  deleteAdvertisement: async (id, user) => {
    const ad = await Advertisement.findById(id);
    if (!ad) {
      throw new NotFoundError("Advertisement not found.");
    }

    const userId = user?.id || user?._id;
    const isOwner = String(ad.userId) === String(userId);
    const isCentralAdmin = user.role === ROLES.CENTRAL_ADMIN;

    let isChapterAdmin = false;
    if (user.role === ROLES.CHAPTER_ADMIN) {
      let chapterId = user.chapterId;
      if (!chapterId && user.chapter) {
        chapterId = await resolveChapterIdByName(user.chapter);
      }
      isChapterAdmin = Boolean(chapterId && String(chapterId) === String(ad.chapterId));
    }

    let isStateAdmin = false;
    if (user.role === ROLES.STATE_ADMIN && user.state) {
      isStateAdmin = String(user.state).toLowerCase() === String(ad.state).toLowerCase();
    }

    if (!isOwner && !isChapterAdmin && !isStateAdmin && !isCentralAdmin) {
      throw new ForbiddenError("Not authorized to remove this advertisement.");
    }

    await Advertisement.findByIdAndDelete(id);
    return { success: true, message: "Advertisement removed successfully" };
  },
};

export default advertisementService;
