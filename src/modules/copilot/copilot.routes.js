import { Router } from "express";
import { optionalAuthMiddleware } from "../../middleware/auth.middleware.js";
import { chatWithCopilot, getCopilotSuggestions } from "./copilot.controller.js";

const copilotRoutes = Router();

// Copilot endpoints: authenticated users get full RBAC context; unauthenticated fallback to business_owner
copilotRoutes.post("/chat", optionalAuthMiddleware, chatWithCopilot);
copilotRoutes.get("/suggestions", optionalAuthMiddleware, getCopilotSuggestions);

export { copilotRoutes };
export default copilotRoutes;
