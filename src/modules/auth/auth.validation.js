import { Joi, text } from "../common.js";
const password = Joi.string().custom((value, helpers) =>
  Buffer.byteLength(value, "utf8") <= 72 ? value : helpers.error("any.invalid"),
);
export const login = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  password: password.required(),
}).required();
export const staff = Joi.object({
  name: text.required(),
  email: Joi.string().trim().lowercase().email().required(),
  password: password.min(12).max(72).required(),
  role: Joi.string().valid("ADMIN", "STAFF").required(),
}).required();
export const update = Joi.object({
  role: Joi.string().valid("ADMIN", "STAFF"),
  is_active: Joi.boolean(),
})
  .min(1)
  .required();
