import { ok } from "../common.js";
import * as service from "./availability.service.js";
export const availability = async (req, res) =>
  ok(res, await service.availability(req.input.query));
export const schedule = async (req, res) =>
  ok(res, await service.schedule(req.input.query));
