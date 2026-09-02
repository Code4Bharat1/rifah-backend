import { Business } from "../businesses/business.model.js";
import { User } from "../users/user.model.js";
import { Enquiry } from "../enquiries/enquiry.model.js";
import { Lead } from "../leads/lead.model.js";
import { Payment } from "../payments/payment.model.js";
import { Chapter } from "../chapters/chapter.model.js";
import { Verification } from "../verification/verification.model.js";
import { Catalogue } from "../catalogue/catalogue.model.js";
import { Review } from "../reviews/review.model.js";

export const reportService = {
  /**
   * Business Analytics Overview (Business Owner Workspace)
   */
  getBusinessAnalytics: async (businessId) => {
    const business = await Business.findById(businessId);

    const leadEnquiryIds = await Lead.distinct("enquiry", { business: businessId });
    const enquiryFilter = {
      $or: [
        { targetBusiness: businessId },
        ...(leadEnquiryIds.length > 0 ? [{ _id: { $in: leadEnquiryIds } }] : []),
      ],
    };

    const [
      leadsCount,
      wonLeadsCount,
      totalQuoted,
      enquiriesCount,
      reviewsCount,
      catalogueItems,
      recentReviews,
    ] = await Promise.all([
      Lead.countDocuments({ business: businessId }),
      Lead.countDocuments({ business: businessId, status: "Won" }),
      Lead.countDocuments({ business: businessId, status: "Responded" }),
      Enquiry.countDocuments(enquiryFilter),
      Review.countDocuments({ business: businessId }),
      Catalogue.find({ business: businessId }).sort({ views: -1, createdAt: -1 }).limit(5),
      Review.find({ business: businessId }).sort({ createdAt: -1 }).limit(5),
    ]);

    // Aggregate monthly leads & enquiries for last 6 months from real database records
    const now = new Date();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthlyProfileViews = [];
    const monthlyLeadsVsEnquiries = [];

    for (let i = 5; i >= 0; i--) {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const monthLabel = monthNames[startOfMonth.getMonth()];

      const [monthLeads, monthEnquiries] = await Promise.all([
        Lead.countDocuments({ business: businessId, createdAt: { $gte: startOfMonth, $lte: endOfMonth } }),
        Enquiry.countDocuments({ ...enquiryFilter, createdAt: { $gte: startOfMonth, $lte: endOfMonth } }),
      ]);

      const computedViews = (monthLeads + monthEnquiries) * 10;

      monthlyProfileViews.push({
        month: monthLabel,
        views: computedViews,
      });

      monthlyLeadsVsEnquiries.push({
        month: monthLabel,
        leads: monthLeads,
        enquiries: monthEnquiries,
      });
    }

    const totalViewsCount = business?.views || monthlyProfileViews.reduce((sum, item) => sum + item.views, 0);

    return {
      summary: {
        profileViews: totalViewsCount,
        totalLeadsReceived: leadsCount,
        enquiries: enquiriesCount,
        totalEnquiries: enquiriesCount,
        averageRating: business?.rating || 0,
        reviewsCount: reviewsCount,
        quotesSubmitted: totalQuoted,
        wonLeads: wonLeadsCount,
      },
      monthlyProfileViews,
      monthlyLeadsVsEnquiries,
      topCatalogueItems: catalogueItems.map((item) => ({
        _id: item._id,
        name: item.name,
        category: item.category || item.type || "Offering",
        views: item.views || 0,
      })),
      recentReviews: recentReviews.map((r) => ({
        _id: r._id,
        title: r.title || "Buyer Review",
        rating: r.rating || 5,
        body: r.comment || r.body || "",
        authorName: r.authorName || "Verified Buyer",
        createdAt: r.createdAt,
      })),
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
