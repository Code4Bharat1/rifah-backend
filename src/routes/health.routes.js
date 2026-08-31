import { Router } from "express";
import mongoose from "mongoose";

const router = Router();

router.get("/", (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";

  res.status(200).json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      api: "healthy",
      database: dbStatus,
    },
  });
});

export { router as healthRoutes };
export default router;
