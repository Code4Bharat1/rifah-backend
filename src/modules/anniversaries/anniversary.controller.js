import { anniversaryService } from "./anniversary.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export const anniversaryController = {
  /**
   * Get today's anniversaries for logged-in user and their chapter
   */
  getTodayAnniversaries: asyncHandler(async (req, res) => {
    const data = await anniversaryService.getTodayAnniversaries(req.user);
    res.json({
      success: true,
      data,
    });
  }),

  /**
   * Manual trigger for anniversary email dispatch (Admins only)
   */
  triggerAnniversaryEmails: asyncHandler(async (req, res) => {
    const sentCount = await anniversaryService.checkAndSendAnniversaryEmails();
    res.json({
      success: true,
      message: `Anniversary email task executed. Sent ${sentCount} email(s).`,
      sentCount,
    });
  }),

  /**
   * Seed test businesses celebrating their anniversary today
   */
  seedAnniversaryTestData: asyncHandler(async (req, res) => {
    const result = await anniversaryService.seedAnniversaryTestData(req.user);
    res.json({
      success: true,
      message: `Successfully seeded ${result.count} test businesses celebrating anniversary today in ${result.chapter}`,
      data: result,
    });
  }),
};
