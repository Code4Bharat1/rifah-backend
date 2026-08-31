import { Business } from "../businesses/business.model.js";
import { User } from "../users/user.model.js";
import { Enquiry } from "../enquiries/enquiry.model.js";
import { Lead } from "../leads/lead.model.js";
import { Payment } from "../payments/payment.model.js";
import { Chapter } from "../chapters/chapter.model.js";
import { Verification } from "../verification/verification.model.js";

export const reportService = {
  /**
   * Business Analytics Overview (Business Owner Workspace)
   */
  getBusinessAnalytics: async (businessId) => {
    const [leadsCount, wonLeadsCount, totalQuoted] = await Promise.all([
      Lead.countDocuments({ business: businessId }),
      Lead.countDocuments({ business: businessId, status: "Won" }),
      Lead.countDocuments({ business: businessId, status: "Responded" }),
    ]);

    return {
      overview: {
        totalLeads: leadsCount,
        wonLeads: wonLeadsCount,
        quotesSubmitted: totalQuoted,
        conversionRate: leadsCount > 0 ? ((wonLeadsCount / leadsCount) * 100).toFixed(1) + "%" : "0%",
      },
      leadBreakdown: {
        new: await Lead.countDocuments({ business: businessId, status: "New" }),
        inProgress: await Lead.countDocuments({ business: businessId, status: "In Progress" }),
        responded: await Lead.countDocuments({ business: businessId, status: "Responded" }),
        won: wonLeadsCount,
        lost: await Lead.countDocuments({ business: businessId, status: "Lost" }),
      },
    };
  },

  /**
   * Secretariat / Admin Chamber-wide KPI Dashboard
   */
  getAdminOverview: async () => {
    const [
      totalBusinesses,
      verifiedBusinesses,
      pendingVerifications,
      totalUsers,
      totalEnquiries,
      totalChapters,
      paymentsAgg,
    ] = await Promise.all([
      Business.countDocuments({ status: "Active" }),
      Business.countDocuments({ verification: "verified" }),
      Verification.countDocuments({ status: "pending" }),
      User.countDocuments({ status: "Active" }),
      Enquiry.countDocuments(),
      Chapter.countDocuments({ status: "Active" }),
      Payment.aggregate([
        { $match: { status: "Paid" } },
        { $group: { _id: null, totalRevenue: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
    ]);

    const revenue = paymentsAgg[0]?.totalRevenue || 0;
    const paidTransactions = paymentsAgg[0]?.count || 0;

    return {
      kpi: {
        totalBusinesses,
        verifiedBusinesses,
        pendingVerifications,
        totalUsers,
        totalEnquiries,
        totalChapters,
        totalRevenue: revenue,
        paidTransactions,
      },
    };
  },
};
