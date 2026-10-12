import { Router } from "express";
import { dignitaryController } from "./dignitary.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";

const router = Router();

// Protect all dignitary routes for authenticated admins
router.use(
  authMiddleware,
  requireRole(
    ROLES.CENTRAL_ADMIN,
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.SECRETARIAT,
    ROLES.COUNTRY_ADMIN,
    ROLES.STATE_ADMIN,
    ROLES.CHAPTER_ADMIN
  )
);

router.get("/", dignitaryController.getAll);
router.get("/:id", validateObjectIdParam("id"), dignitaryController.getById);
router.post("/", dignitaryController.create);
router.patch("/:id", validateObjectIdParam("id"), dignitaryController.update);
router.delete("/:id", validateObjectIdParam("id"), dignitaryController.delete);

export { router as dignitaryRoutes };
export default router;
