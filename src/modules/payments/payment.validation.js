import { Joi, id } from "../common.js";
export const desk = Joi.object({
  amount: Joi.number()
    .positive()
    .max(1000000000)
    .precision(2)
    .strict()
    .required(),
  method: Joi.string().valid("CASH", "UPI", "CARD").required(),
  transaction_reference: Joi.string().trim().max(200),
}).required();
export const refund = Joi.object({
  payment_id: id.required(),
  transaction_reference: Joi.string().trim().max(200).required(),
}).required();
export const online = Joi.object({ booking_id: id.required() }).required();
