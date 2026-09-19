import { Referral } from "./referral.model.js";
import { thankYouNoteService } from "./thank-you-note.service.js";
import { resolveOwnBusiness, resolveMemberBusiness } from "./networking.utils.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { ROLES } from "../../shared/constants/roles.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../shared/errors/errors.js";

const POPULATE_FIELDS = [
  ["referrerBusiness", "name logo city"],
  ["referredBusiness", "name logo city"],
  ["referrerUser", "name email phone"],
  ["referredUser", "name email phone"],
  ["referrerChapterId", "name state"],
  ["referredChapterId", "name state"],
  ["thankYouNote", "amount note createdAt"],
];

const withPopulate = (query) =>
  POPULATE_FIELDS.reduce((q, [path, select]) => q.populate(path, select), query);

const buildScopeFilter = (user) => {
  if (!user) return { _id: null };
  if (user.role === ROLES.CENTRAL_ADMIN) return {};
  if (user.role === ROLES.STATE_ADMIN) {
    if (!user.state) return { _id: null };
    const re = new RegExp(`^${user.state.trim()}$`, "i");
    return { $or: [{ referrerState: re }, { referredState: re }] };
  }
  if (user.role === ROLES.CHAPTER_ADMIN) {
    if (!user.chapterId) return { _id: null };
    return { $or: [{ referrerChapterId: user.chapterId }, { referredChapterId: user.chapterId }] };
  }
  return { _id: null };
};

export const referralService = {
  /**
   * The current user refers a fellow member's business to a lead of theirs
   * (the lead need not be a RIFAH member — just a name/contact on file).
   */
  create: async (userId, data) => {
    const { referredBusinessId, leadName, leadContact, leadIsMember, description } = data;

    if (!referredBusinessId) {
      throw new BadRequestError("Please select the member you're referring business to.");
    }
    if (!leadName || !leadName.trim()) {
      throw new BadRequestError("Please enter the name of the person you're referring.");
    }
    if (!description || !description.trim()) {
      throw new BadRequestError("Please describe the requirement you're referring.");
    }

    const referrerBusiness = await resolveOwnBusiness(userId);

    if (String(referrerBusiness._id) === String(referredBusinessId)) {
      throw new BadRequestError("You cannot refer business to yourself.");
    }

    const referredBusiness = await resolveMemberBusiness(referredBusinessId);

    const record = await Referral.create({
      referrerUser: userId,
      referrerBusiness: referrerBusiness._id,
      referrerChapterId: referrerBusiness.chapterId,
      referrerState: referrerBusiness.state,

      referredUser: referredBusiness.owner,
      referredBusiness: referredBusiness._id,
      referredChapterId: referredBusiness.chapterId,
      referredState: referredBusiness.state,

      leadName: leadName.trim(),
      leadContact: (leadContact || "").trim(),
      leadIsMember: Boolean(leadIsMember),
      description: description.trim(),
    });

    return withPopulate(Referral.findById(record._id));
  },

  /**
   * The referred business closes the loop: business worth `amount` was
   * generated from the lead, so they thank the referrer for it. This creates
   * the same ThankYouNote ledger entry as a direct thank-you: the closer
   * (current user) is the business RECEIVER, the referrer is the GIVER.
   */
  close: async (userId, referralId, { amount, note }) => {
    const referral = await Referral.findById(referralId);
    if (!referral) throw new NotFoundError("Referral not found");

    if (String(referral.referredUser) !== String(userId)) {
      throw new ForbiddenError("Only the member who received this referral can close it with a thank you note.");
    }
    if (referral.status === "Closed") {
      throw new BadRequestError("This referral has already been closed.");
    }

    const thankYouNote = await thankYouNoteService.create(userId, {
      counterpartBusinessId: referral.referrerBusiness,
      amount,
      note,
      referralId: referral._id,
    });

    referral.status = "Closed";
    referral.thankYouNote = thankYouNote._id;
    referral.closedAt = new Date();
    await referral.save();

    return withPopulate(Referral.findById(referral._id));
  },

  listMine: async (userId, queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = { $or: [{ referrerUser: userId }, { referredUser: userId }] };

    const [records, total] = await Promise.all([
      withPopulate(Referral.find(filter).sort(sort).skip(skip).limit(limit)),
      Referral.countDocuments(filter),
    ]);

    return { records, meta: buildPaginationMeta(total, page, limit) };
  },

  listForAdmin: async (user, queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = buildScopeFilter(user);

    const [records, total] = await Promise.all([
      withPopulate(Referral.find(filter).sort(sort).skip(skip).limit(limit)),
      Referral.countDocuments(filter),
    ]);

    return { records, meta: buildPaginationMeta(total, page, limit) };
  },

  getById: async (id, user) => {
    const record = await withPopulate(Referral.findById(id));
    if (!record) throw new NotFoundError("Referral not found");

    const partyIds = [
      String(record.referrerUser?._id || record.referrerUser),
      String(record.referredUser?._id || record.referredUser),
    ];
    if (partyIds.includes(String(user.id))) return record;

    if (user.role === ROLES.CENTRAL_ADMIN) return record;

    if (user.role === ROLES.STATE_ADMIN && user.state) {
      const re = new RegExp(`^${user.state.trim()}$`, "i");
      if (re.test(record.referrerState) || re.test(record.referredState)) return record;
    }

    if (user.role === ROLES.CHAPTER_ADMIN && user.chapterId) {
      const referrerChapterId = String(record.referrerChapterId?._id || record.referrerChapterId);
      const referredChapterId = String(record.referredChapterId?._id || record.referredChapterId);
      if (referrerChapterId === String(user.chapterId) || referredChapterId === String(user.chapterId)) {
        return record;
      }
    }

    throw new ForbiddenError("You do not have access to this record");
  },
};
