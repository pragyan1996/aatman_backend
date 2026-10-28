import { Joi, id, text, phone } from "../common.js";
export const instant = Joi.string()
  .isoDate()
  .pattern(/(Z|[+-]\d\d:\d\d)$/);
const customer = Joi.object({
  name: text.required(),
  phone: phone.required(),
  email: Joi.string().email(),
});
export const create = Joi.object({
  customer,
  customer_id: id,
  resource_id: id.required(),
  start_at: instant.required(),
  end_at: instant.required(),
  participants: id.max(10000).default(1),
  booking_source: Joi.string().valid("DESK", "ONLINE").default("DESK"),
  payment_option: Joi.string()
    .valid("PAY_AT_DESK", "PAY_ONLINE")
    .default("PAY_AT_DESK"),
  notes: Joi.string().max(2000).allow(""),
})
  .xor("customer", "customer_id")
  .required();
export const reschedule = Joi.object({
  resource_id: id,
  start_at: instant.required(),
  end_at: instant.required(),
}).required();
export const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);
export const list = Joi.object({
  date,
  date_from: date,
  date_to: date,
  tab: Joi.string().valid("TODAY", "UPCOMING", "PAST"),
  sport_id: id,
  resource_id: id,
  source: Joi.string().valid("DESK", "ONLINE"),
  payment_status: Joi.string().valid("PAID", "PARTIAL", "UNPAID"),
  booking_status: Joi.string().valid(
    "HELD",
    "CONFIRMED",
    "CANCELLED",
    "EXPIRED",
    "COMPLETED",
  ),
  search: Joi.string().max(100),
  sort: Joi.string()
    .valid("start_at", "created_at", "total_amount")
    .default("start_at"),
  sort_order: Joi.string().valid("asc", "desc").default("asc"),
  page: id.max(1000000).default(1),
  limit: id.max(100).default(25),
});
