import { Router } from "express";
import { catalogueController } from "./catalogue.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import {
  validateCreateCatalogueItem,
  validateUpdateCatalogueItem,
} from "./catalogue.validation.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";

const router = Router();

// Public catalogue discovery
router.get("/", catalogueController.searchCatalogue);
router.get("/business/:businessId", validateObjectIdParam("businessId"), catalogueController.listByBusiness);

// Business Owner catalogue management
router.post(
  "/",
  authMiddleware,
  validateRequest(validateCreateCatalogueItem),
  catalogueController.createItem
);

router.patch(
  "/:id",
  authMiddleware,
  validateObjectIdParam("id"),
  validateRequest(validateUpdateCatalogueItem),
  catalogueController.updateItem
);

router.post(
  "/:id/images",
  authMiddleware,
  validateObjectIdParam("id"),
  upload.array("catalogue", 5),
  catalogueController.uploadItemImages
);

router.delete(
  "/:id",
  authMiddleware,
  validateObjectIdParam("id"),
  catalogueController.deleteItem
);

export { router as catalogueRoutes };
export default router;
