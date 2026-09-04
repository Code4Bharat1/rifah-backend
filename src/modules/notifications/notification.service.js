import { Notification } from "./notification.model.js";
import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import { Lead } from "../leads/lead.model.js";
import { Enquiry } from "../enquiries/enquiry.model.js";
import { Payment } from "../payments/payment.model.js";
import { Review } from "../reviews/review.model.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError } from "../../shared/errors/errors.js";

export const notificationService = {
  /**
   * Create an in-app notification
   */
  createNotification: async ({ recipientId, type, title, body, entityId, link }) => {
    return Notification.create({
      recipient: recipientId,
      type: type || "System",
      title,
      body,
      entityId: entityId || "",
      link: link || "",
    });
  },

  /**
   * Broadcast a notification to all active users or members of a chapter
   */
  broadcastNotification: async ({ type, title, body, chapter, link, targetRole }) => {
    const query = { status: "Active" };
    if (chapter && chapter !== "all") query.chapter = chapter;
    
    if (targetRole && targetRole !== "all") {
      if (targetRole === "business_owner") query.role = "Business Owner";
      else if (targetRole === "customer") query.role = "Consumer";
      else query.role = targetRole;
    }

    const broadcastId = `BC-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const users = await User.find(query).select("_id");
    const notifications = users.map((u) => ({
      recipient: u._id,
      type: type || "System",
      title,
      body,
      link: link || "",
      broadcastId,
    }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }

    return { sentCount: notifications.length, broadcastId };
  },

  /**
   * Delete a broadcast by its broadcastId across all users
   */
  deleteBroadcast: async (broadcastId) => {
    if (!broadcastId) throw new Error("broadcastId is required");
    const result = await Notification.deleteMany({ broadcastId });
    return { deletedCount: result.deletedCount };
  },

  /**
   * Sync real user activity items into Notification collection
   */
  syncRealUserNotifications: async (userId) => {
    try {
      const business = await Business.findOne({ owner: userId });
      const businessId = business?._id;

      // 1. Sync real assigned leads
      if (businessId) {
        const leads = await Lead.find({ business: businessId }).populate("enquiry").sort({ createdAt: -1 }).limit(5);
        for (const l of leads) {
          const ref = l.enquiry?.referenceId || (l._id ? `ENQ-${l._id.toString().slice(-4).toUpperCase()}` : "ENQ");
          const reqTitle = l.enquiry?.title || "Buyer Requirement";
          const title = "New lead assigned";
          const body = `${ref} · ${reqTitle} matched your category.`;
          const exists = await Notification.findOne({ recipient: userId, entityId: String(l._id) });
          if (!exists) {
            await Notification.create({
              recipient: userId,
              type: "Lead",
              title,
              body,
              entityId: String(l._id),
              link: "/biz/leads",
              isRead: false,
              createdAt: l.createdAt,
            });
          }
        }
      }

      // 2. Sync real payments
      const payments = await Payment.find({ payer: userId }).sort({ createdAt: -1 }).limit(5);
      for (const p of payments) {
        const title = "Payment received";
        const body = `Invoice ${p.invoiceNumber} for ₹${p.amount} has been marked as paid.`;
        const exists = await Notification.findOne({ recipient: userId, entityId: String(p._id) });
        if (!exists) {
          await Notification.create({
            recipient: userId,
            type: "Payment",
            title,
            body,
            entityId: String(p._id),
            link: "/biz/payments",
            isRead: true,
            createdAt: p.paidAt || p.createdAt,
          });
        }
      }

      // 3. Sync real direct enquiries
      if (businessId) {
        const enquiries = await Enquiry.find({ targetBusiness: businessId }).sort({ createdAt: -1 }).limit(5);
        for (const e of enquiries) {
          const title = `New enquiry from ${e.requesterName || "Buyer"}`;
          const body = `${e.referenceId} · ${e.title}`;
          const exists = await Notification.findOne({ recipient: userId, entityId: String(e._id) });
          if (!exists) {
            await Notification.create({
              recipient: userId,
              type: "Enquiry",
              title,
              body,
              entityId: String(e._id),
              link: "/biz/enquiries",
              isRead: false,
              createdAt: e.createdAt,
            });
          }
        }
      }

      // 4. Sync real reviews
      if (businessId) {
        const reviews = await Review.find({ business: businessId }).sort({ createdAt: -1 }).limit(3);
        for (const r of reviews) {
          const title = "New review received";
          const body = `A buyer left a ${r.rating || 5}-star review on your business profile.`;
          const exists = await Notification.findOne({ recipient: userId, entityId: String(r._id) });
          if (!exists) {
            await Notification.create({
              recipient: userId,
              type: "Review",
              title,
              body,
              entityId: String(r._id),
              link: "/biz/analytics",
              isRead: true,
              createdAt: r.createdAt,
            });
          }
        }
      }

      // 5. Sync verification status
      if (business?.verificationStatus) {
        const title = "Verification update";
        const body = `Your business verification is ${business.verificationStatus === "Verified" ? "approved and active" : "under review by RIFAH"}.`;
        const exists = await Notification.findOne({ recipient: userId, type: "Account", title });
        if (!exists) {
          await Notification.create({
            recipient: userId,
            type: "Account",
            title,
            body,
            link: "/biz/verification",
            isRead: true,
          });
        }
      }

      // 6. Sync membership status
      if (business?.expiresAt || business?.membershipTier) {
        const expiryDate = new Date(business.expiresAt || (Date.now() + 365 * 86400000)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        const title = "Membership renewal due";
        const body = `Your ${business.membershipTier || "Growth"} membership expires on ${expiryDate}.`;
        const exists = await Notification.findOne({ recipient: userId, type: "Membership", title });
        if (!exists) {
          await Notification.create({
            recipient: userId,
            type: "Membership",
            title,
            body,
            link: "/biz/membership",
            isRead: false,
          });
        }
      }
    } catch (err) {
      console.error("Failed syncing real user notifications:", err);
    }
  },

  /**
   * List notifications for current user
   */
  listUserNotifications: async (userId, queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);

    // Sync real database activities into Notification collection first
    await notificationService.syncRealUserNotifications(userId);

    const filter = { recipient: userId };
    if (queryParams.unreadOnly === "true") {
      filter.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort(sort).skip(skip).limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipient: userId, isRead: false }),
    ]);

    return {
      notifications,
      unreadCount,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Mark single notification as read
   */
  markAsRead: async (notificationId, userId) => {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    if (!notification) {
      throw new NotFoundError("Notification not found");
    }
    return notification;
  },

  /**
   * Mark all notifications as read for current user
   */
  markAllAsRead: async (userId) => {
    await Notification.updateMany(
      { recipient: userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    return true;
  },

  /**
   * Delete a single notification for the current user
   */
  deleteNotification: async (notificationId, userId) => {
    const result = await Notification.findOneAndDelete({ _id: notificationId, recipient: userId });
    if (!result) {
      throw new NotFoundError("Notification not found");
    }
    return result;
  },

  /**
   * Clear all notifications for the current user
   */
  clearAllNotifications: async (userId) => {
    const result = await Notification.deleteMany({ recipient: userId });
    return { deletedCount: result.deletedCount };
  },
};
