import { ok } from "../common.js";
import * as service from "./booking.service.js";
import * as queries from "./booking.queries.js";
export const summary = async (req, res) =>
  ok(res, await queries.summary(req.input.query.date));
export const list = async (req, res) =>
  ok(res, await queries.list(req.input.query));
export const create = async (req, res) =>
  ok(
    res,
    await service.create(
      req.input.body,
      req.user.id,
      req.get("Idempotency-Key"),
    ),
    201,
    "Booking created successfully",
  );
export const detail = async (req, res) =>
  ok(res, await service.detail(req.input.params.id));
export const events = async (req, res) =>
  ok(res, await service.events(req.input.params.id));
export const update = async (req, res) =>
  ok(
    res,
    await service.update(req.input.params.id, req.input.body, req.user.id),
  );
export const cancel = async (req, res) =>
  ok(
    res,
    await service.cancel(
      req.input.params.id,
      req.input.body.reason,
      req.user.id,
    ),
  );
export const reschedule = async (req, res) =>
  ok(
    res,
    await service.reschedule(req.input.params.id, req.input.body, req.user.id),
  );
