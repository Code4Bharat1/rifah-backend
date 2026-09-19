import { Router } from "express";
import { documentController } from "./document.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", documentController.getDocuments);
router.post("/", requireRole("central_admin", "state_admin", "chapter_admin"), documentController.create);
router.patch("/:id", requireRole("central_admin", "state_admin", "chapter_admin"), documentController.update);
router.delete("/:id", requireRole("central_admin", "state_admin", "chapter_admin"), documentController.delete);

export { router as documentRoutes };
