import { askCopilot, getFilteredContext } from "./copilot.service.js";

/**
 * Handle conversational search queries
 * POST /api/v1/copilot/chat
 */
export async function chatWithCopilot(req, res, next) {
  try {
    const { message, conversationHistory, role } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "A message string is required.",
      });
    }

    // Determine user context:
    // If authenticated via JWT token, use verified req.user.
    // If not authenticated, default safely to business_owner to prevent unauthorized privilege escalation.
    let userContext = req.user;
    if (!userContext) {
      userContext = {
        role: "business_owner",
        name: "Guest Member",
      };
    }

    const result = await askCopilot({
      message: message.trim(),
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
      user: userContext,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get available quick features & prompts for the authenticated role
 * GET /api/v1/copilot/suggestions
 */
export async function getCopilotSuggestions(req, res, next) {
  try {
    const role = req.user?.role || req.query?.role || "business_owner";
    const context = getFilteredContext(role);
    const suggestions = (context.modules || []).slice(0, 6).map((m) => ({
      title: m.title,
      route: m.route,
      prompt: `Where do I find ${m.title}?`,
    }));

    return res.json({
      success: true,
      data: {
        role: context.role,
        suggestions,
        totalAuthorizedModules: context.modules.length,
      },
    });
  } catch (error) {
    next(error);
  }
}
