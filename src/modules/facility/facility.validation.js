import { Joi, id, text, phone } from "../common.js";
export const sport = {
  name: text,
  description: Joi.string().max(2000).allow(null, ""),
  is_active: Joi.boolean(),
};
export const resource = {
  sport_id: id,
  name: text,
  surface_type: text.allow(null, ""),
  capacity: id.max(10000),
  booking_type: Joi.string().valid("EXCLUSIVE", "SHARED"),
  pricing_model: Joi.string().valid("RESOURCE", "PARTICIPANT"),
  price_per_hour: Joi.number().min(0).max(1000000).precision(2).strict(),
  is_active: Joi.boolean(),
};
export const customer = {
  full_name: text,
  phone,
  email: Joi.string().trim().lowercase().email().allow(null, ""),
};
export const list = Joi.object({
  search: Joi.string().trim().max(100).default(""),
  sport_id: id,
  is_active: Joi.boolean(),
  page: id.default(1),
  limit: id.max(100).default(25),
});
export const hours = Joi.object({
  hours: Joi.array()
    .items(
      Joi.object({
        day_of_week: Joi.number().integer().min(0).max(6).required(),
        opening_time: Joi.string()
          .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
          .required(),
        closing_time: Joi.string()
          .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
          .required(),
        is_closed: Joi.boolean().default(false),
      }),
    )
    .length(7)
    .unique("day_of_week")
    .required(),
});
