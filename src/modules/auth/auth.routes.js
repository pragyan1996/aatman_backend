import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { validate, params } from "../common.js";
import { authenticate, admin } from "./auth.service.js";
import * as v from "./auth.validation.js";
import * as c from "./auth.controller.js";
const r = Router();
r.post(
  "/login",
  rateLimit({
    windowMs: 900000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many login attempts",
      error: { code: "RATE_LIMITED" },
    },
  }),
  validate(v.login),
  c.login,
);
r.get("/me", authenticate, c.me);
r.post("/logout", authenticate, c.logout);
r.get("/users", authenticate, admin, c.users);
r.post("/users", authenticate, admin, validate(v.staff), c.createUser);
r.patch(
  "/users/:id",
  authenticate,
  admin,
  params,
  validate(v.update),
  c.updateUser,
);
export default r;
