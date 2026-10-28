import Joi from 'joi';

export const bookingSummaryQuerySchema = Joi.object({
    date: Joi.date().required()
});