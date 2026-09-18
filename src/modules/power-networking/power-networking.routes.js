import { Router } from "express";
import { powerNetworkingController } from "./power-networking.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Protect all power networking routes to authenticated business owners / members
router.use(authMiddleware);

// Dashboard statistics
router.get("/stats", powerNetworkingController.getStats);

// Permanent Power Network Ecosystem
router.get("/my-network", powerNetworkingController.getMyNetwork);
router.post("/my-network/:id/remove", validateObjectIdParam("id"), powerNetworkingController.removeFromNetwork);
router.post("/request-quote", powerNetworkingController.requestQuote);

// Requirements
router.get("/requirements", powerNetworkingController.getRequirements);
router.post("/requirements", powerNetworkingController.createRequirement);
router.get("/requirements/:id", validateObjectIdParam("id"), powerNetworkingController.getRequirementById);
router.get("/requirements/:id/matches", validateObjectIdParam("id"), powerNetworkingController.getRequirementMatches);

// Business discovery
router.get("/discover", powerNetworkingController.discoverBusinesses);

// Connection requests
router.post("/connections", powerNetworkingController.sendConnectionRequest);
router.get("/connections", powerNetworkingController.getConnections);
router.get("/requests", powerNetworkingController.getRequests);
router.post("/requests/:id/respond", validateObjectIdParam("id"), powerNetworkingController.respondToRequest);
router.post("/requests/:id/cancel", validateObjectIdParam("id"), powerNetworkingController.cancelRequest);

export { router as powerNetworkingRoutes };
export default router;
