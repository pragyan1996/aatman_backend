import { Joi, id } from "../common.js";
import { date } from "../bookings/booking.validation.js";
import { env } from "../../config/env.js";
const base = { date: date.required(), sport_id: id, resource_id: id };
export const availability = Joi.object({
  ...base,
  duration_minutes: id
    .max(1440)
    .multiple(env.slotMinutes)
    .default(env.slotMinutes * Math.max(1, Math.round(60 / env.slotMinutes))),
  participants: id.default(1),
});
export const schedule = Joi.object(base);
