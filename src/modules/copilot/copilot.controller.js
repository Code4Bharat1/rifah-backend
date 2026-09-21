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
    // If client passes explicit role (e.g. chapter_admin), honor it for role-specific scoping.
    let userContext = req.user ? { ...req.user } : { role: "business_owner", name: "Guest Member" };
    if (role) {
      userContext.role = role;
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
