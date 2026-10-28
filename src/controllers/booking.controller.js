import { getBookingSummary } from "../services/booking.services.js";
import { ok } from "../modules/common.js";
export const summary = async (req, res) =>
  ok(res, await getBookingSummary(req.input.query.date));
