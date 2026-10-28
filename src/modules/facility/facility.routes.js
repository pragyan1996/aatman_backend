import { Router } from "express";
import { Joi, validate, params } from "../common.js";
import { authenticate, admin } from "../auth/auth.service.js";
import * as v from "./facility.validation.js";
import * as c from "./facility.controller.js";
import { instant } from "../bookings/booking.validation.js";
const router = Router();
router.use(authenticate);
for (const [table, fields, requiredFields] of [
  ["sports", v.sport, ["name"]],
  [
    "resources",
    v.resource,
    ["sport_id", "name", "capacity", "booking_type", "price_per_hour"],
  ],
  ["customers", v.customer, ["full_name", "phone"]],
]) {
  const access = table === "customers" ? [] : [admin];
  router.get("/" + table, validate(v.list, "query"), c.list(table));
  router.get("/" + table + "/:id", params, c.get(table));
  router.post(
    "/" + table,
    ...access,
    validate(
      Joi.object(fields)
        .fork(requiredFields, (s) => s.required())
        .required(),
    ),
    c.create(table),
  );
  router.patch(
    "/" + table + "/:id",
    ...access,
    params,
    validate(Joi.object(fields).min(1).required()),
    c.update(table),
  );
}
router.get("/resources/:id/operating-hours", params, c.hours);
router.put(
  "/resources/:id/operating-hours",
  admin,
  params,
  validate(v.hours),
  c.setHours,
);
router.get("/resources/:id/unavailability", params, c.blocks);
router.post(
  "/resources/:id/unavailability",
  admin,
  params,
  validate(
    Joi.object({
      start_at: instant.required(),
      end_at: instant.required(),
      reason: Joi.string().max(2000).required(),
    }).required(),
  ),
  c.block,
);
export default router;
