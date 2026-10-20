import Joi from 'joi';

export const registerSchema = Joi.object({
  name: Joi.string().trim().min(1).max(150).required(),
  email: Joi.string().trim().lowercase().email().max(254).required(),
  phone: Joi.string().trim().pattern(/^\+[1-9][0-9]{7,14}$/).required(),
  password: Joi.string().min(6).max(128).required(),
}).required();

export const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().max(254).required(),
  password: Joi.string().max(128).required(),
}).required();
