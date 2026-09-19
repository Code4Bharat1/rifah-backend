import { User } from "../users/user.model.js";
import { ROLES } from "../../shared/constants/roles.js";
import { resolveEligibleAdminBusiness } from "../../shared/utils/admin-eligibility.js";

export const centralAdminService = {
  /**
   * Returns the single current Central Admin, if any.
   */
  getCurrent: async () => {
    return User.findOne({ role: ROLES.CENTRAL_ADMIN }).select("-passwordHash");
  },

  /**
   * Transfers the Central Admin role to the owner of the given business.
   * Enforces:
   *  - the nominee's business must be paid + verified (resolveEligibleAdminBusiness)
   *  - there is only ever ONE Central Admin at a time: every other user
   *    currently holding the role (there should normally be at most one, but
   *    this self-heals if duplicates ever existed) is demoted back to their
   *    previous role.
   */
  transfer: async (businessId) => {
    const business = await resolveEligibleAdminBusiness(businessId);
    const nominee = business.owner;

    const currentAdmins = await User.find({
      role: ROLES.CENTRAL_ADMIN,
      _id: { $ne: nominee._id },
    });

    for (const admin of currentAdmins) {
      admin.role = admin.previousRole || ROLES.BUSINESS_OWNER;
      admin.previousRole = "";
      await admin.save();
    }

    if (nominee.role !== ROLES.CENTRAL_ADMIN) {
      nominee.previousRole = nominee.role;
    }
    nominee.role = ROLES.CENTRAL_ADMIN;
    await nominee.save();

    return nominee;
  },
};

export default centralAdminService;
