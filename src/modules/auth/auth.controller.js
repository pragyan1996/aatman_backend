import { ok } from "../common.js";
import * as service from "./auth.service.js";
export async function login(req, res) {
  res.set("Cache-Control", "no-store");
  ok(res, await service.login(req.input.body));
}
export function me(req, res) {
  res.set("Cache-Control", "no-store");
  ok(res, req.user);
}
export async function logout(req, res) {
  await service.revoke(req.claims.jti, req.claims.exp);
  ok(res, null, 200, "Logged out");
}
export async function users(req, res) {
  ok(res, await service.users());
}
export async function createUser(req, res) {
  ok(res, await service.createUser(req.input.body), 201);
}
export async function updateUser(req, res) {
  ok(res, await service.updateUser(req.input.params.id, req.input.body));
}
