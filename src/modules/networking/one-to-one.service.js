import { OneToOne } from "./one-to-one.model.js";
import { resolveOwnBusiness, resolveMemberBusiness } from "./networking.utils.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { ROLES } from "../../shared/constants/roles.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../shared/errors/errors.js";

const POPULATE_FIELDS = [
  ["initiatorBusiness", "name logo city"],
  ["memberBusiness", "name logo city"],
  ["initiatorUser", "name email phone"],
  ["memberUser", "name email phone"],
  ["initiatorChapterId", "name state"],
  ["memberChapterId", "name state"],
];

const withPopulate = (query) =>
  POPULATE_FIELDS.reduce((q, [path, select]) => q.populate(path, select), query);

/**
 * Builds the visibility filter for admin roles: central admin sees everything,
 * a state admin sees records where either party belongs to their state, and a
 * chapter admin sees records where either party belongs to their chapter.
 */
const buildScopeFilter = (user) => {
  if (!user) return { _id: null };
  if (user.role === ROLES.SUPER_ADMIN) return {};
  if (user.role === ROLES.STATE_ADMIN) {
    if (!user.state) return { _id: null };
    const re = new RegExp(`^${user.state.trim()}$`, "i");
    return { $or: [{ initiatorState: re }, { memberState: re }] };
  }
  if (user.role === ROLES.CHAPTER_ADMIN) {
    if (!user.chapterId) return { _id: null };
    return { $or: [{ initiatorChapterId: user.chapterId }, { memberChapterId: user.chapterId }] };
  }
  return { _id: null };
};

export const oneToOneService = {
  create: async (userId, data) => {
    const { memberBusinessId, meetingDate, meetingTime, location, description, initiatedBy } = data;

    if (!memberBusinessId) throw new BadRequestError("Please select the member you met.");
    if (!meetingDate) throw new BadRequestError("Meeting date is required.");
    if (!meetingTime) throw new BadRequestError("Meeting time is required.");
    if (!location || !location.trim()) throw new BadRequestError("Location is required.");
    if (!description || !description.trim()) throw new BadRequestError("Description / purpose is required.");
    if (!["self", "member"].includes(initiatedBy)) {
      throw new BadRequestError("Please specify who initiated the meeting.");
    }

    const initiatorBusiness = await resolveOwnBusiness(userId);

    if (String(initiatorBusiness._id) === String(memberBusinessId)) {
      throw new BadRequestError("You cannot log a one-to-one meeting with yourself.");
    }

    const memberBusiness = await resolveMemberBusiness(memberBusinessId);

    const record = await OneToOne.create({
      initiatorUser: userId,
      initiatorBusiness: initiatorBusiness._id,
      initiatorChapterId: initiatorBusiness.chapterId,
      initiatorState: initiatorBusiness.state,

      memberUser: memberBusiness.owner,
      memberBusiness: memberBusiness._id,
      memberChapterId: memberBusiness.chapterId,
      memberState: memberBusiness.state,

      meetingDate: new Date(meetingDate),
      meetingTime: meetingTime.trim(),
      location: location.trim(),
      description: description.trim(),
      initiatedBy,
    });

    return withPopulate(OneToOne.findById(record._id));
  },

  listMine: async (userId, queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = { $or: [{ initiatorUser: userId }, { memberUser: userId }] };

    const [records, total] = await Promise.all([
      withPopulate(OneToOne.find(filter).sort(sort).skip(skip).limit(limit)),
      OneToOne.countDocuments(filter),
    ]);

    return { records, meta: buildPaginationMeta(total, page, limit) };
  },

  listForAdmin: async (user, queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = buildScopeFilter(user);

    const [records, total] = await Promise.all([
      withPopulate(OneToOne.find(filter).sort(sort).skip(skip).limit(limit)),
      OneToOne.countDocuments(filter),
    ]);

    return { records, meta: buildPaginationMeta(total, page, limit) };
  },

  getById: async (id, user) => {
    const record = await withPopulate(OneToOne.findById(id));
    if (!record) throw new NotFoundError("One-to-one record not found");

    const partyIds = [
      String(record.initiatorUser?._id || record.initiatorUser),
      String(record.memberUser?._id || record.memberUser),
    ];
    if (partyIds.includes(String(user.id))) return record;

    if (user.role === ROLES.SUPER_ADMIN) return record;

    if (user.role === ROLES.STATE_ADMIN && user.state) {
      const re = new RegExp(`^${user.state.trim()}$`, "i");
      if (re.test(record.initiatorState) || re.test(record.memberState)) return record;
    }

    if (user.role === ROLES.CHAPTER_ADMIN && user.chapterId) {
      const initiatorChapterId = String(record.initiatorChapterId?._id || record.initiatorChapterId);
      const memberChapterId = String(record.memberChapterId?._id || record.memberChapterId);
      if (initiatorChapterId === String(user.chapterId) || memberChapterId === String(user.chapterId)) {
        return record;
      }
    }

    throw new ForbiddenError("You do not have access to this record");
  },
};
