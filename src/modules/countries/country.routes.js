import { Router } from "express";
import { countryController } from "./country.controller.js";
import {
  authMiddleware,
  optionalAuthMiddleware,
} from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  validateAssignCountryAdmin,
  validateCreateCountry,
  validateUpdateCountry,
} from "./country.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

router.get("/", optionalAuthMiddleware, countryController.listCountries);

router.post(
  "/assign-admin",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN),
  validateRequest(validateAssignCountryAdmin),
  countryController.assignCountryAdmin,
);

router.get(
  "/:countryName",
  optionalAuthMiddleware,
  countryController.getCountryByName,
);

router.post(
  "/",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN),
  validateRequest(validateCreateCountry),
  countryController.createCountry,
);

router.put(
  "/:countryName",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN),
  validateRequest(validateUpdateCountry),
  countryController.updateCountryByName,
);

router.patch(
  "/:id",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN),
  validateRequest(validateUpdateCountry),
  countryController.updateCountry,
);

router.delete(
  "/:countryName/admin",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN),
  countryController.removeCountryAdmin,
);

router.delete(
  "/:countryName",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN),
  countryController.deleteCountryByName,
);

router.delete(
  "/:id",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN),
  countryController.deleteCountry,
);

export { router as countryRoutes };
export default router;
