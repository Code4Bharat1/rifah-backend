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

    // Aggregate Membership Mix
    const membershipMixAgg = await Business.aggregate([
      { $group: { _id: "$membership", count: { $sum: 1 } } }
    ]);
    const membershipMix = { Basic: 0, Premium: 0, Enterprise: 0 };
    membershipMixAgg.forEach(item => {
      const tier = String(item._id || "").toLowerCase();
      if (tier.includes("enterprise")) membershipMix.Enterprise += item.count;
      else if (tier.includes("premium")) membershipMix.Premium += item.count;
      else membershipMix.Basic += item.count; 
    });

    // Aggregate Chapters distribution
    const chaptersAgg = await Business.aggregate([
      { $match: { chapter: { $exists: true, $ne: "" } } },
      { $group: { _id: "$chapter", members: { $sum: 1 } } },
      { $sort: { members: -1 } },
      { $limit: 6 }
    ]);
    const chaptersDistribution = chaptersAgg.map(c => ({ name: c._id, members: c.members }));

    // Membership Growth (last 6 months cumulative businesses)
    const growth = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      // Last day of the month
      const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const count = await Business.countDocuments({ createdAt: { $lte: d } });
      const monthName = new Date(now.getFullYear(), now.getMonth() - i, 1).toLocaleString('default', { month: 'short' });
      
      // Calculate new registrations for that specific month to compute renewal rate if needed
      const startOfMonth = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const newThisMonth = await Business.countDocuments({ createdAt: { $gte: startOfMonth, $lte: d } });

      growth.push({
        name: monthName,
        total: count,
        new: newThisMonth
      });
    }

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
      membershipMix,
      chaptersDistribution,
      membershipGrowth: growth
    };
  },
};
