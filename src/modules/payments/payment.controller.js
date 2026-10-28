import { ok } from "../common.js";
import * as service from "./payment.service.js";
export const list = async (req, res) =>
  ok(res, await service.list(req.input.params.id));
export const desk = async (req, res) =>
  ok(
    res,
    await service.desk(
      req.input.params.id,
      req.input.body,
      req.user.id,
      req.get("Idempotency-Key"),
    ),
    201,
  );
export const refund = async (req, res) =>
  ok(
    res,
    await service.refund(
      req.input.params.id,
      req.input.body,
      req.user.id,
      req.get("Idempotency-Key"),
    ),
    201,
  );
export const online = async (req, res) =>
  ok(
    res,
    await service.online(
      req.input.body,
      req.user.id,
      req.get("Idempotency-Key"),
    ),
    201,
  );
export const webhook = async (req, res) =>
  ok(res, await service.webhook(req.body, req.headers));
