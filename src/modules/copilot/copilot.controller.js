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

    // Determine user context securely:
    // Only verified administrators can request administrative scoping.
    const ADMIN_ROLES = [
      "central_admin",
      "super_admin",
      "admin",
      "secretariat",
      "state_admin",
      "chapter_admin",
      "country_admin",
    ];

    let userContext;
    if (req.user) {
      userContext = { ...req.user };
      if (role) {
        // Only allow switching to an admin role if caller is already a verified admin
        if (!ADMIN_ROLES.includes(role) || ADMIN_ROLES.includes(req.user.role)) {
          userContext.role = role;
        }
      }
    } else {
      userContext = { role: "business_owner", name: "Guest Member" };
      if (role && !ADMIN_ROLES.includes(role)) {
        userContext.role = role;
      }
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
    const ADMIN_ROLES = [
      "central_admin",
      "super_admin",
      "admin",
      "secretariat",
      "state_admin",
      "chapter_admin",
      "country_admin",
    ];
    let role = req.user?.role || "business_owner";
    if (req.query?.role) {
      if (!ADMIN_ROLES.includes(req.query.role) || (req.user && ADMIN_ROLES.includes(req.user.role))) {
        role = req.query.role;
      }
    }
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
