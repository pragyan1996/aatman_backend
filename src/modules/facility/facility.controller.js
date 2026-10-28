import { ok } from "../common.js";
import * as service from "./facility.service.js";
export const list = (table) => async (req, res) =>
  ok(res, await service.list(table, req.input.query));
export const get = (table) => async (req, res) =>
  ok(res, await service.get(table, req.input.params.id));
export const create = (table) => async (req, res) =>
  ok(res, await service.create(table, req.input.body), 201);
export const update = (table) => async (req, res) =>
  ok(res, await service.update(table, req.input.params.id, req.input.body));
export const hours = async (req, res) =>
  ok(res, await service.hours(req.input.params.id));
export const setHours = async (req, res) =>
  ok(res, await service.setHours(req.input.params.id, req.input.body.hours));
export const blocks = async (req, res) =>
  ok(res, await service.blocks(req.input.params.id));
export const block = async (req, res) =>
  ok(res, await service.block(req.input.params.id, req.input.body), 201);
