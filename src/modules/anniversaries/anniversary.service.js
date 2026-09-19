import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { logger } from "../../infrastructure/logger/logger.js";

/**
 * Checks if a given joiningDate matches the current date in the specified timezone
 * and calculates completed milestone years (>= 1).
 */
export function isAnniversaryToday(joiningDate, timezone = "Asia/Kolkata") {
  if (!joiningDate) return { isToday: false, yearsCompleted: 0 };

  const tz = timezone && typeof timezone === "string" ? timezone.trim() : "Asia/Kolkata";
  const now = new Date();

  // 1. Get current month, day, and year in the specified timezone
  let currentMonth, currentDay, currentYear;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    const parts = formatter.formatToParts(now);
    currentMonth = Number(parts.find((p) => p.type === "month")?.value);
    currentDay = Number(parts.find((p) => p.type === "day")?.value);
    currentYear = Number(parts.find((p) => p.type === "year")?.value);
  } catch {
    currentMonth = now.getMonth() + 1;
    currentDay = now.getDate();
    currentYear = now.getFullYear();
  }

  // 2. Extract join month, day, and year
  let joinMonth, joinDay, joinYear;

  if (typeof joiningDate === "string") {
    const clean = joiningDate.trim().split("T")[0];
    const parts = clean.split("-");
    if (parts.length === 3 && parts[0].length === 4) {
      // YYYY-MM-DD
      joinYear = Number(parts[0]);
      joinMonth = Number(parts[1]);
      joinDay = Number(parts[2]);
    } else if (parts.length === 3 && parts[2].length === 4) {
      // DD-MM-YYYY
      joinDay = Number(parts[0]);
      joinMonth = Number(parts[1]);
      joinYear = Number(parts[2]);
    } else {
      const d = new Date(joiningDate);
      if (isNaN(d.getTime())) return { isToday: false, yearsCompleted: 0 };
      joinYear = d.getUTCFullYear();
      joinMonth = d.getUTCMonth() + 1;
      joinDay = d.getUTCDate();
    }
  } else if (joiningDate instanceof Date) {
    if (isNaN(joiningDate.getTime())) return { isToday: false, yearsCompleted: 0 };
    joinYear = joiningDate.getUTCFullYear();
    joinMonth = joiningDate.getUTCMonth() + 1;
    joinDay = joiningDate.getUTCDate();

    // Fallback localized check
    if (joinMonth !== currentMonth || joinDay !== currentDay) {
      try {
        const dFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          year: "numeric",
          month: "numeric",
          day: "numeric",
        });
        const dParts = dFormatter.formatToParts(joiningDate);
        const altMonth = Number(dParts.find((p) => p.type === "month")?.value);
        const altDay = Number(dParts.find((p) => p.type === "day")?.value);
        const altYear = Number(dParts.find((p) => p.type === "year")?.value);
        if (altMonth === currentMonth && altDay === currentDay) {
          joinMonth = altMonth;
          joinDay = altDay;
          joinYear = altYear;
        }
      } catch {}
    }
  } else {
    return { isToday: false, yearsCompleted: 0 };
  }

  const isToday = joinMonth === currentMonth && joinDay === currentDay;
  const yearsCompleted = currentYear - joinYear;

  // Only trigger anniversary if at least 1 full year has completed
  return {
    isToday: isToday && yearsCompleted >= 1,
    yearsCompleted: yearsCompleted >= 1 ? yearsCompleted : 0,
  };
}

/**
 * Gets current year in the given timezone
 */
export function getCurrentYear(timezone = "Asia/Kolkata") {
  const now = new Date();
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "Asia/Kolkata",
      year: "numeric",
    });
    return Number(formatter.format(now));
  } catch {
    return now.getFullYear();
  }
}

export const anniversaryService = {
  /**
   * Get today's anniversaries for the current logged-in user:
   * 1. Whether today is their own business RIFAH joining anniversary (isSelfAnniversary)
   * 2. Other businesses in their chapter who have their RIFAH anniversary today
   */
  getTodayAnniversaries: async (currentUser) => {
    if (!currentUser) {
      return {
        isSelfAnniversary: false,
        selfName: "",
        selfBusinessName: "",
        selfYearsCompleted: 0,
        todayAnniversaries: [],
        totalCount: 0,
      };
    }

    const currentUserId = currentUser.id || currentUser._id;
    const userDoc = await User.findById(currentUserId).select(
      "name email phone whatsapp avatar role chapter state city joiningDate timezone lastAnniversaryWishYear createdAt"
    );
    const myBiz = await Business.findOne({ owner: currentUserId }).select(
      "name joiningDate timezone chapter createdAt"
    );

    const effectiveRole = userDoc?.role || currentUser.role;

    // Admin / Super Admin should NOT receive chapter celebration alerts or notifications
    if (["super_admin", "admin", "secretariat"].includes(effectiveRole)) {
      return {
        isSelfAnniversary: false,
        selfName: "",
        selfBusinessName: "",
        selfYearsCompleted: 0,
        todayAnniversaries: [],
        totalCount: 0,
      };
    }

    const effectiveJoiningDate = myBiz?.joiningDate || userDoc?.joiningDate || myBiz?.createdAt || userDoc?.createdAt || null;
    const effectiveTimezone = userDoc?.timezone || myBiz?.timezone || "Asia/Kolkata";
    const effectiveChapter = userDoc?.chapter || myBiz?.chapter || currentUser.chapter || "";

    // 1. Check self anniversary
    const { isToday: isSelf, yearsCompleted: selfYearsCompleted } = isAnniversaryToday(
      effectiveJoiningDate,
      effectiveTimezone
    );

    // If it is self anniversary and email/notification not sent this year yet, trigger immediately!
    const currentYr = getCurrentYear(effectiveTimezone);
    if (isSelf && selfYearsCompleted >= 1 && userDoc && Number(userDoc.lastAnniversaryWishYear || 0) !== currentYr) {
      try {
        await emailService.sendAnniversaryWishEmail({
          email: userDoc.email,
          name: userDoc.name,
          businessName: myBiz?.name || "",
          chapter: effectiveChapter,
          yearsCompleted: selfYearsCompleted,
        });

        const ordinal = selfYearsCompleted === 1 ? "1st" : selfYearsCompleted === 2 ? "2nd" : selfYearsCompleted === 3 ? "3rd" : `${selfYearsCompleted}th`;
        await notificationService.createNotification({
          recipientId: userDoc._id,
          type: "System",
          title: `🎉 Happy ${ordinal} Anniversary with RIFAH Chamber! 🎊`,
          body: `Congratulations on completing ${selfYearsCompleted} year${selfYearsCompleted > 1 ? "s" : ""} with RIFAH Chamber of Commerce & Industry. Together for a brighter tomorrow!`,
          link: "/biz",
        });

        userDoc.lastAnniversaryWishYear = currentYr;
        await userDoc.save();

        if (myBiz) {
          myBiz.lastAnniversaryWishYear = currentYr;
          await myBiz.save();
        }

        logger.info(`[ANNIVERSARY EMAIL & NOTIFICATION SENT LIVE] To: ${userDoc.email} (${selfYearsCompleted} Year(s))`);
      } catch (emailErr) {
        logger.error("[ANNIVERSARY EMAIL/NOTIFICATION ERROR]", emailErr);
      }
    }

    // 2. Query scope for chapter members / businesses
    const isAdmin = ["super_admin", "secretariat"].includes(userDoc?.role || currentUser.role);
    const isStateAdmin = (userDoc?.role || currentUser.role) === "state_admin";

    const bizQuery = {
      status: { $in: ["Active", "active", "Live"] },
    };

    if (isStateAdmin && (userDoc?.state || currentUser.state)) {
      bizQuery.state = userDoc?.state || currentUser.state;
    } else if (!isAdmin && effectiveChapter) {
      bizQuery.chapter = effectiveChapter;
    }

    // Fetch active businesses in this chapter/scope
    const candidateBusinesses = await Business.find(bizQuery)
      .select("name slug owner phone whatsapp chapter state city joiningDate timezone createdAt")
      .populate("owner", "name email phone whatsapp avatar")
      .lean();

    const todayAnniversaries = [];

    for (const biz of candidateBusinesses) {
      const bizJoinDate = biz.joiningDate || biz.createdAt;
      const bizTz = biz.timezone || "Asia/Kolkata";
      const { isToday: isBizToday, yearsCompleted } = isAnniversaryToday(bizJoinDate, bizTz);

      if (isBizToday && yearsCompleted >= 1) {
        const ownerDoc = biz.owner || {};
        todayAnniversaries.push({
          businessId: biz._id,
          businessName: biz.name,
          businessSlug: biz.slug,
          userId: ownerDoc._id || biz.owner,
          userName: ownerDoc.name || biz.name,
          userAvatar: ownerDoc.avatar || "",
          chapter: biz.chapter || effectiveChapter || "",
          phone: biz.phone || ownerDoc.phone || "",
          whatsapp: biz.whatsapp || ownerDoc.whatsapp || biz.phone || ownerDoc.phone || "",
          email: ownerDoc.email || "",
          yearsCompleted,
          isSelf: String(ownerDoc._id || biz.owner) === String(currentUserId),
        });
      }
    }

    return {
      isSelfAnniversary: isSelf,
      selfName: userDoc?.name || currentUser.name || "Member",
      selfBusinessName: myBiz?.name || "",
      selfYearsCompleted,
      todayAnniversaries,
      totalCount: todayAnniversaries.length,
    };
  },

  /**
   * Cron / Periodic trigger: Checks all registered businesses and users, sending automated Anniversary emails
   */
  checkAndSendAnniversaryEmails: async () => {
    try {
      const candidateBusinesses = await Business.find({
        status: { $in: ["Active", "active", "Live"] },
      })
        .select("name joiningDate timezone chapter lastAnniversaryWishYear owner createdAt")
        .populate("owner", "name email lastAnniversaryWishYear");

      let sentCount = 0;

      for (const biz of candidateBusinesses) {
        const joinDate = biz.joiningDate || biz.createdAt;
        const bizTz = biz.timezone || "Asia/Kolkata";
        const { isToday, yearsCompleted } = isAnniversaryToday(joinDate, bizTz);
        const currentYear = getCurrentYear(bizTz);

        if (isToday && yearsCompleted >= 1 && Number(biz.lastAnniversaryWishYear || 0) !== currentYear) {
          const user = biz.owner;
          if (user && user.email) {
            await emailService.sendAnniversaryWishEmail({
              email: user.email,
              name: user.name,
              businessName: biz.name,
              chapter: biz.chapter || "",
              yearsCompleted,
            });

            const ordinal = yearsCompleted === 1 ? "1st" : yearsCompleted === 2 ? "2nd" : yearsCompleted === 3 ? "3rd" : `${yearsCompleted}th`;
            await notificationService.createNotification({
              recipientId: user._id,
              type: "System",
              title: `🎉 Happy ${ordinal} Anniversary with RIFAH Chamber! 🎊`,
              body: `Congratulations on completing ${yearsCompleted} year${yearsCompleted > 1 ? "s" : ""} with RIFAH Chamber of Commerce & Industry. Together for a brighter tomorrow!`,
              link: "/biz",
            });

            user.lastAnniversaryWishYear = currentYear;
            await user.save();
          }

          biz.lastAnniversaryWishYear = currentYear;
          await biz.save();
          sentCount++;
          logger.info(`[ANNIVERSARY CRON] Sent to: ${biz.name} (${yearsCompleted} Year(s))`);
        }
      }

      if (sentCount > 0) {
        logger.info(`[ANNIVERSARY CRON] Successfully processed and sent ${sentCount} anniversary email(s).`);
      }
      return sentCount;
    } catch (error) {
      logger.error("[ANNIVERSARY CRON ERROR] Failed to run anniversary email task:", error);
      return 0;
    }
  },

  /**
   * Starts periodic scheduler to check and send anniversary emails hourly
   */
  startAnniversaryScheduler: () => {
    // Initial check after 15 seconds of startup
    setTimeout(() => {
      anniversaryService.checkAndSendAnniversaryEmails().catch(() => {});
    }, 15000);

    // Run hourly
    setInterval(() => {
      anniversaryService.checkAndSendAnniversaryEmails().catch(() => {});
    }, 60 * 60 * 1000);

    logger.info("[ANNIVERSARY SCHEDULER] Anniversary hourly wish scheduler started.");
  },
};
