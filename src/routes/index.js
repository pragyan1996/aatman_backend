// The complete API is registered in app.js; retained for legacy imports.
import { Router } from "express";
import bookingRoutes from "./booking.routes.js";
const router = Router();
router.use("/bookings", bookingRoutes);
export default router;
