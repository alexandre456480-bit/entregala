import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, requireAdmin } from "../../auth.js";
import { ApiError, dbError } from "../../errors.js";
import type { Profile } from "../../../shared/models.js";
import type { MapContext, MapResult } from "../../../shared/maps.js";
import {
  baseSchema,
  locationSchema,
  geocodeSchema,
  mapRequestSchema,
  reorderSchema,
  proposalSchema,
} from "../../validation/maps.js";
import { calculate, geocode, validateContext } from "./provider.js";
async function rpc<T>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    if(error.code==='42P01')throw new ApiError(503,'MAP_SETUP','A busca de endereços precisa da atualização de mapas no banco. Você pode informar as coordenadas manualmente.');
    if (error.code === "P0001")
      throw new ApiError(
        429,
        "MAP_LIMIT",
        "Limite de solicitações atingido ou cálculo em andamento. Aguarde antes de tentar novamente.",
      );
    throw dbError(error.code);
  }
  return data as T;
}
export async function mapsController(
  path: string,
  body: unknown,
  client: SupabaseClient,
  profile: Profile,
): Promise<unknown> {
  if (path === "/api/maps/base") {
    requireAdmin(profile);
    const p = baseSchema.parse(body);
    return rpc(client, "save_base", { payload: p });
  }
  if (path === "/api/maps/location") {
    requireAdmin(profile);
    const p = locationSchema.parse(body);
    return rpc(client, "confirm_location", {
      target: p.id,
      lat: p.latitude,
      lon: p.longitude,
      expected: p.expected_updated_at,
    });
  }
  if (path === "/api/maps/reorder") {
    const p = reorderSchema.parse(body);
    return rpc(client, "reorder_route", {
      target: p.route_id,
      ids: p.order_ids,
      expected: p.expected_updated_at,
    });
  }
  if (path === "/api/maps/apply") {
    const p = proposalSchema.parse(body);
    return rpc(client, "apply_map_proposal", {
      target: p.route_id,
      proposal: p.proposal_id,
      expected: p.expected_updated_at,
    });
  }
  if (path === "/api/maps/geocode") {
    requireAdmin(profile);
    const p = geocodeSchema.parse(body);
    if (!process.env["GEOAPIFY_SERVER_KEY"])
      throw new ApiError(
        503,
        "MAP_CONFIG",
        "Configure a chave privada Geoapify no servidor.",
      );
    const scope = createHash("sha256")
      .update(p.address.toLocaleLowerCase("pt-BR"))
      .digest("hex");
    const request = await rpc<string>(client, "claim_map_request", {
      kind: "geocode",
      scope,
    });
    try {
      return await geocode(p.address);
    } finally {
      await rpc(client, "finish_map_request", { request }).catch(
        () => undefined,
      );
    }
  }
  if (path === "/api/maps/route") {
    const p = mapRequestSchema.parse(body);
    const kind = p.action === "cached" ? p.kind || "routing" : p.action;
    const context = await rpc<MapContext>(client, "map_context", {
      target: p.route_id,
    });
    const cached = await rpc<MapResult | null>(client, "cached_map", {
      target: p.route_id,
      kind,
    });
    if (cached || p.action === "cached") return cached;
    validateContext(context);
    if (!process.env["GEOAPIFY_SERVER_KEY"])
      throw new ApiError(
        503,
        "MAP_CONFIG",
        "Configure a chave privada Geoapify no servidor.",
      );
    const request = await rpc<string>(client, "claim_map_request", {
      kind,
      scope: context.fingerprint,
      target: p.route_id,
    });
    try {
      const result = await calculate(context, kind === "optimize");
      const current = await rpc<MapContext>(client, "map_context", {
        target: p.route_id,
      });
      if (
        current.fingerprint !== context.fingerprint ||
        current.updated_at !== context.updated_at
      )
        throw new ApiError(
          409,
          "STALE_ROUTE",
          "A rota ou uma localização mudou durante o cálculo. Atualize antes de tentar novamente.",
        );
      const id = await rpc<string>(adminClient(), "store_map_result", {
        target: p.route_id,
        source_fingerprint: context.fingerprint,
        kind,
        result,
      });
      return { id, fingerprint: context.fingerprint, kind, result };
    } finally {
      await rpc(client, "finish_map_request", { request }).catch(
        () => undefined,
      );
    }
  }
  throw new ApiError(404, "NOT_FOUND", "Operação de mapas não encontrada.");
}
