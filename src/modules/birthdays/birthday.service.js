import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { logger } from "../../infrastructure/logger/logger.js";

/**
 * Checks if a given DOB matches the current date in the specified timezone
 */
export function isBirthdayToday(dobDate, timezone = "Asia/Kolkata") {
  if (!dobDate) return false;

  const tz = timezone && typeof timezone === "string" ? timezone.trim() : "Asia/Kolkata";
  const now = new Date();

  // 1. Get current month & day in the specified timezone (e.g. Asia/Kolkata)
  let currentMonth, currentDay;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "numeric",
      day: "numeric",
    });
    const parts = formatter.formatToParts(now);
    currentMonth = Number(parts.find((p) => p.type === "month")?.value);
    currentDay = Number(parts.find((p) => p.type === "day")?.value);
  } catch {
    currentMonth = now.getMonth() + 1;
    currentDay = now.getDate();
  }

  // 2. Extract birth month & day from dobDate
  let birthMonth, birthDay;

  if (typeof dobDate === "string") {
    const clean = dobDate.trim().split("T")[0];
    const parts = clean.split("-");
    if (parts.length === 3 && parts[0].length === 4) {
      // YYYY-MM-DD
      birthMonth = Number(parts[1]);
      birthDay = Number(parts[2]);
    } else if (parts.length === 3 && parts[2].length === 4) {
      // DD-MM-YYYY
      birthDay = Number(parts[0]);
      birthMonth = Number(parts[1]);
    } else {
      const d = new Date(dobDate);
      if (isNaN(d.getTime())) return false;
      birthMonth = d.getUTCMonth() + 1;
      birthDay = d.getUTCDate();
    }
  } else if (dobDate instanceof Date) {
    if (isNaN(dobDate.getTime())) return false;
    birthMonth = dobDate.getUTCMonth() + 1;
    birthDay = dobDate.getUTCDate();

    // Check localized fallback in target timezone
    if (birthMonth !== currentMonth || birthDay !== currentDay) {
      try {
        const dFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          month: "numeric",
          day: "numeric",
        });
        const dParts = dFormatter.formatToParts(dobDate);
        const altMonth = Number(dParts.find((p) => p.type === "month")?.value);
        const altDay = Number(dParts.find((p) => p.type === "day")?.value);
        if (altMonth === currentMonth && altDay === currentDay) {
          return true;
        }
      } catch {}
    }
  } else {
    return false;
  }

  return birthMonth === currentMonth && birthDay === currentDay;
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

export const birthdayService = {
  /**
   * Get today's birthdays for the current logged-in user:
   * 1. Whether today is their own birthday (isSelfBirthday)
   * 2. Members / Businesses in their chapter who have their birthday today
   */
  getTodayBirthdays: async (currentUser) => {
    if (!currentUser) {
      return { isSelfBirthday: false, selfName: "", todayBirthdays: [], totalCount: 0 };
    }

    const currentUserId = currentUser.id || currentUser._id;
    const userDoc = await User.findById(currentUserId).select("name email phone whatsapp avatar role chapter state city dob timezone lastBirthdayWishYear");
    const myBiz = await Business.findOne({ owner: currentUserId }).select("name dob timezone chapter");

    const effectiveRole = userDoc?.role || currentUser.role;

    // Admin / Super Admin should NOT receive chapter celebration alerts or notifications
    if (["super_admin", "admin", "secretariat"].includes(effectiveRole)) {
      return { isSelfBirthday: false, selfName: "", todayBirthdays: [], totalCount: 0 };
    }

    const effectiveDob = userDoc?.dob || myBiz?.dob || null;
    const effectiveTimezone = userDoc?.timezone || myBiz?.timezone || "Asia/Kolkata";
    const effectiveChapter = userDoc?.chapter || myBiz?.chapter || currentUser.chapter || "";

    // 1. Check self birthday
    const isSelf = isBirthdayToday(effectiveDob, effectiveTimezone);

    // If it is self birthday and email not sent this year yet, trigger email immediately!
    if (isSelf && userDoc && Number(userDoc.lastBirthdayWishYear || 0) !== getCurrentYear(effectiveTimezone)) {
      try {
        await emailService.sendBirthdayWishEmail({
          email: userDoc.email,
          name: userDoc.name,
          businessName: myBiz?.name || "",
          chapter: effectiveChapter,
        });

        await notificationService.createNotification({
          recipientId: userDoc._id,
          type: "System",
          title: "🎉 Happy Birthday from RIFAH Chamber! 🎂",
          body: "RIFAH Chamber of Commerce wishes you continued success, good health and many more milestones ahead.",
          link: "/biz",
        });

        userDoc.lastBirthdayWishYear = getCurrentYear(effectiveTimezone);
        await userDoc.save();
        logger.info(`[BIRTHDAY EMAIL & NOTIFICATION SENT LIVE] To: ${userDoc.email}`);
      } catch (emailErr) {
        logger.error("[BIRTHDAY EMAIL/NOTIFICATION ERROR]", emailErr);
      }
    }

    // 2. Query scope based on role
    const isAdmin = ["central_admin", "super_admin", "admin"].includes(userDoc?.role || currentUser.role);
    const isStateAdmin = (userDoc?.role || currentUser.role) === "state_admin";

    const userQuery = {
      dob: { $ne: null, $exists: true },
    };

    if (isStateAdmin && (userDoc?.state || currentUser.state)) {
      userQuery.state = userDoc?.state || currentUser.state;
    } else if (!isAdmin && effectiveChapter) {
      userQuery.chapter = effectiveChapter;
    }

    // Fetch users with non-null DOB
    const candidateUsers = await User.find(userQuery)
      .select("name email phone whatsapp avatar role chapter state city dob timezone")
      .lean();

    // Filter to only those whose birthday is TODAY in their respective timezone
    const celebratingUsers = candidateUsers.filter((u) => isBirthdayToday(u.dob, u.timezone));

    // Fetch businesses for these users to include Business Name and Logo
    const userIds = celebratingUsers.map((u) => u._id);
    const businesses = await Business.find({ owner: { $in: userIds } })
      .select("name slug logo chapter owner phone whatsapp dob")
      .lean();

    const bizMap = new Map();
    businesses.forEach((b) => {
      bizMap.set(String(b.owner), b);
    });

    const todayBirthdays = celebratingUsers.map((u) => {
      const biz = bizMap.get(String(u._id));
      return {
        userId: u._id,
        userName: u.name,
        userAvatar: u.avatar || "",
        businessId: biz?._id || null,
        businessName: biz?.name || u.name,
        businessSlug: biz?.slug || null,
        chapter: u.chapter || biz?.chapter || effectiveChapter || "",
        phone: u.phone || biz?.phone || "",
        whatsapp: u.whatsapp || biz?.whatsapp || u.phone || "",
        email: u.email,
        isSelf: String(u._id) === String(currentUserId),
      };
    });

    return {
      isSelfBirthday: isSelf,
      selfName: userDoc?.name || currentUser.name || "Member",
      todayBirthdays,
      totalCount: todayBirthdays.length,
    };
  },

  /**
   * Cron / Periodic trigger: Checks all registered users and sends automated Birthday Wish email
   * to anyone celebrating their birthday today who hasn't received it for the current year.
   */
  checkAndSendBirthdayEmails: async () => {
    try {
      const candidateUsers = await User.find({
        dob: { $ne: null, $exists: true },
      }).select("name email dob timezone chapter lastBirthdayWishYear");

      let sentCount = 0;

      for (const user of candidateUsers) {
        const userTimezone = user.timezone || "Asia/Kolkata";
        const isToday = isBirthdayToday(user.dob, userTimezone);
        const currentYear = getCurrentYear(userTimezone);

        if (isToday && Number(user.lastBirthdayWishYear || 0) !== currentYear) {
          // Find their primary business name if any
          const biz = await Business.findOne({ owner: user._id }).select("name");

          await emailService.sendBirthdayWishEmail({
            email: user.email,
            name: user.name,
            businessName: biz?.name || "",
            chapter: user.chapter || "",
          });

          await notificationService.createNotification({
            recipientId: user._id,
            type: "System",
            title: "🎉 Happy Birthday from RIFAH Chamber! 🎂",
            body: "RIFAH Chamber of Commerce wishes you continued success, good health and many more milestones ahead.",
            link: "/biz",
          });

          user.lastBirthdayWishYear = currentYear;
          await user.save();
          sentCount++;
          logger.info(`[BIRTHDAY EMAIL & NOTIFICATION SENT] To: ${user.email} (${user.name}) for Year: ${currentYear}`);
        }
      }

      if (sentCount > 0) {
        logger.info(`[BIRTHDAY CRON] Successfully processed and sent ${sentCount} birthday wish email(s).`);
      }
      return sentCount;
    } catch (error) {
      logger.error("[BIRTHDAY CRON ERROR] Failed to run birthday email task:", error);
      return 0;
    }
  },

  /**
   * Starts periodic scheduler to check and send birthday emails hourly
   */
  startBirthdayScheduler: () => {
    // Initial check after 10 seconds of startup
    setTimeout(() => {
      birthdayService.checkAndSendBirthdayEmails().catch(() => {});
    }, 10000);

    // Run hourly
    setInterval(() => {
      birthdayService.checkAndSendBirthdayEmails().catch(() => {});
    }, 60 * 60 * 1000);

    logger.info("[BIRTHDAY SCHEDULER] Birthday hourly wish scheduler started.");
  },
};

