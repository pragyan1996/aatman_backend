import { Router } from "express";
import { Joi, validate, params } from "../common.js";
import { authenticate } from "../auth/auth.service.js";
import * as v from "./booking.validation.js";
import { today } from "../../utils/date-time.js";
import * as c from "./booking.controller.js";
const r = Router();
r.use(authenticate);
r.get(
  "/summary",
  validate(Joi.object({ date: v.date.default(today) }), "query"),
  c.summary,
);
r.get("/", validate(v.list, "query"), c.list);
r.post("/", validate(v.create), c.create);
r.get("/:id", params, c.detail);
r.get("/:id/events", params, c.events);
r.patch(
  "/:id",
  params,
  validate(
    Joi.object({
      notes: Joi.string().max(2000).allow("").required(),
    }).required(),
  ),
  c.update,
);
r.patch(
  "/:id/cancel",
  params,
  validate(
    Joi.object({
      reason: Joi.string().trim().min(1).max(2000).required(),
    }).required(),
  ),
  c.cancel,
);
r.patch("/:id/reschedule", params, validate(v.reschedule), c.reschedule);
export default r;
