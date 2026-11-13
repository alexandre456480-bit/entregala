import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError } from "zod";
import { authenticate, requireAdmin, adminClient } from "./auth.js";
import { config } from "./config.js";
import { ApiError, dbError } from "./errors.js";
import {mapsController} from './services/geoapify/controller.js';
import {operationSchema} from './validation/operations.js';
import {
  deleteOrderSchema,
  deleteRouteSchema,
  driverSchema,
  driverStatusSchema,
  orderSchema,
  routeSchema,
} from "../shared/validation.js";

type Request = IncomingMessage & { body?: unknown };
export const MAX_BODY = 96 * 1024;
export async function readBody(req: Request): Promise<unknown> {
  if (Number(req.headers["content-length"] || 0) > MAX_BODY)
    throw new ApiError(413, "TOO_LARGE", "Requisição muito grande.");
  if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || ""))
    throw new ApiError(415, "CONTENT_TYPE", "Envie os dados como JSON.");
  if (req.body !== undefined) {
    if (
      Buffer.byteLength(
        typeof req.body === "string" ? req.body : JSON.stringify(req.body),
      ) > MAX_BODY
    )
      throw new ApiError(413, "TOO_LARGE", "Requisição muito grande.");
    try {
      return typeof req.body === "string"
        ? (JSON.parse(req.body) as unknown)
        : req.body;
    } catch {
      throw new ApiError(400, "INVALID_JSON", "JSON inválido.");
    }
  }
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const b = Buffer.from(chunk);
    size += b.length;
    if (size > MAX_BODY)
      throw new ApiError(413, "TOO_LARGE", "Requisição muito grande.");
    chunks.push(b);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "JSON inválido.");
  }
}
export default async function handler(req: Request, res: ServerResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const respond = (status: number, payload: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
  };
  try {
    if (!["POST", "PATCH"].includes(req.method || "")) {
      res.setHeader("Allow", "POST, PATCH");
      throw new ApiError(405, "METHOD", "Método não permitido.");
    }
    const origin = req.headers.origin;
    if (origin && origin !== config().origin)
      throw new ApiError(403, "ORIGIN", "Origem não permitida.");
    const { client, profile } = await authenticate(req.headers.authorization);
    const body = await readBody(req);
    const path = new URL(req.url || "/", "http://localhost").pathname;
    if(path.startsWith('/api/maps/')&&req.method==='POST'){respond(200,{data:await mapsController(path,body,client,profile)});return;}
    if(path==='/api/operations'&&req.method==='POST'){
      const parsed=operationSchema.parse(body);
      const {data,error}=await client.rpc('operation_command',{payload:parsed});
      if(error)throw dbError(error.code);
      respond(200,{data});return;
    }
    requireAdmin(profile);
    if (path === "/api/orders" && req.method === "PATCH") {
      const parsed = deleteOrderSchema.parse(body);
      const { data, error } = await client.rpc("delete_order", { target: parsed.id, expected: parsed.expected_updated_at, expected_route: parsed.expected_route_id });
      if (error?.code === "P0001") throw new ApiError(409, "PROTECTED", "Este pedido está em uma rota liberada ou possui histórico de operação. Exclua primeiro a rota se ela ainda não tiver iniciado.");
      if (error) throw dbError(error.code);
      respond(200, { data }); return;
    }
    if (path === "/api/routes" && req.method === "PATCH") {
      const parsed = deleteRouteSchema.parse(body);
      const { data, error } = await client.rpc("delete_route", { target: parsed.id, expected: parsed.expected_updated_at });
      if (error?.code === "P0001") throw new ApiError(409, "PROTECTED", "A jornada desta rota já iniciou e seu histórico deve ser preservado.");
      if (error?.code === "55006") throw new ApiError(409, "MAP_BUSY", "Aguarde o cálculo de mapa terminar e tente novamente.");
      if (error) throw dbError(error.code);
      respond(200, { data }); return;
    }
    if (path === "/api/orders" && req.method === "POST") {
      const parsed = orderSchema.parse(body);
      const { data, error } = await client.rpc("save_order", {
        payload: parsed,
      });
      if (error) throw dbError(error.code);
      respond(200, { data });
      return;
    }
    if (path === "/api/routes" && req.method === "POST") {
      const parsed = routeSchema.parse(body);
      const { data, error } = await client.rpc("save_route", {
        payload: parsed,
      });
      if (error) throw dbError(error.code);
      respond(200, { data });
      return;
    }
    if (path === "/api/drivers" && req.method === "POST") {
      const parsed = driverSchema.parse(body);
      // Persistent limiter in PostgreSQL, shared by all serverless instances.
      const { error: rateError } = await client.rpc("claim_driver_provision");
      if (rateError) {
        if (rateError.code === "P0001")
          throw new ApiError(
            429,
            "RATE_LIMIT",
            "Limite de cadastros atingido. Aguarde alguns minutos.",
          );
        throw dbError(rateError.code);
      }
      const admin = adminClient();
      const { data: created, error } = await admin.auth.admin.createUser({
        email: parsed.email,
        password: parsed.password,
        email_confirm: true,
      });
      if (error || !created.user)
        throw new ApiError(
          409,
          "USER_CREATE",
          "Não foi possível criar a conta. Confira o e-mail e tente novamente.",
        );
      const { error: insertError } = await admin
        .from("profiles")
        .insert({
          id: created.user.id,
          name: parsed.name,
          email: parsed.email.toLowerCase(),
          role: "driver",
          active: true,
        });
      if (insertError) {
        // Compensate only the brand-new, unlinked Auth user. Never delete existing users.
        await admin.auth.admin.deleteUser(created.user.id);
        throw new ApiError(
          503,
          "PROFILE_CREATE",
          "Não foi possível provisionar o perfil. Tente novamente.",
        );
      }
      respond(201, { data: { id: created.user.id } });
      return;
    }
    if (path === "/api/drivers" && req.method === "PATCH") {
      const parsed = driverStatusSchema.parse(body);
      const { data, error } = await client.rpc("set_driver_active", {
        driver: parsed.id,
        enabled: parsed.active,
      });
      if (error) throw dbError(error.code);
      respond(200, { data });
      return;
    }
    throw new ApiError(404, "NOT_FOUND", "Operação não encontrada.");
  } catch (error) {
    if (error instanceof ZodError) {
      respond(422, {
        error: {
          code: "INVALID_DATA",
          message: "Confira os campos informados.",
          fields: error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
      });
      return;
    }
    const e =
      error instanceof ApiError
        ? error
        : new ApiError(
            503,
            "UNAVAILABLE",
            "Serviço indisponível. Verifique a configuração e tente novamente.",
          );
    respond(e.status, { error: { code: e.code, message: e.message } });
  }
}
