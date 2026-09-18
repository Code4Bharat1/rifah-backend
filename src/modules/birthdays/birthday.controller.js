import { birthdayService } from "./birthday.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export const birthdayController = {
  /**
   * Get today's birthdays relevant to the authenticated user
   */
  getTodayBirthdays: asyncHandler(async (req, res) => {
    const data = await birthdayService.getTodayBirthdays(req.user);
    res.status(200).json({
      success: true,
      data,
    });
  }),

  /**
   * Trigger birthday emails manually (Admin only or system trigger)
   */
  triggerBirthdayEmails: asyncHandler(async (req, res) => {
    const count = await birthdayService.checkAndSendBirthdayEmails();
    res.status(200).json({
      success: true,
      message: `Processed birthday emails. Sent ${count} wish email(s).`,
      sentCount: count,
    });
  }),
};
