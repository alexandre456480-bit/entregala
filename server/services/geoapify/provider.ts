import { z } from "zod";
import { ApiError } from "../../errors";
import type {
  MapContext,
  RouteCalculation,
  GeocodeCandidate,
} from "../../../shared/maps";
import { lngLat, confirmed } from "../../../shared/maps";
const finite = z.number().finite().nonnegative();
const point = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
const geometry = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("LineString"),
    coordinates: z.array(point).min(2).max(50000),
  }),
  z.object({
    type: z.literal("MultiLineString"),
    coordinates: z.array(z.array(point).min(2).max(50000)).min(1).max(100),
  }),
]);
const external = z.object({
  type: z.literal("FeatureCollection"),
  properties: z
    .object({ issues: z.record(z.string(), z.unknown()).optional() })
    .passthrough()
    .optional(),
  features: z
    .array(
      z.object({
        geometry: z.unknown().optional(),
        properties: z
          .object({
            distance: finite,
            time: finite,
            agent_index: z.number().int().optional(),
            actions: z
              .array(
                z.object({
                  type: z.string(),
                  job_id: z.string().optional(),
                  job_index: z.number().int().nonnegative().optional(),
                }),
              )
              .optional(),
            legs: z
              .array(
                z.object({
                  distance: finite,
                  time: finite,
                  steps: z
                    .array(
                      z.object({
                        from_index: z.number().int().nonnegative(),
                        to_index: z.number().int().nonnegative(),
                      }),
                    )
                    .optional(),
                }),
              )
              .optional(),
          })
          .passthrough(),
      }),
    )
    .min(1)
    .max(1),
});
const unavailable = () =>
  new ApiError(
    502,
    "MAP_PROVIDER",
    "O serviço de mapas não respondeu corretamente. Sua sequência foi preservada.",
  );
export function validateContext(context: MapContext) {
  if (!context.origin)
    throw new ApiError(
      422,
      "ORIGIN_REQUIRED",
      "Configure e confirme a base da distribuidora antes de calcular.",
    );
  if (context.stops.length < 1 || context.stops.length > 30)
    throw new ApiError(
      422,
      "STOP_LIMIT",
      "O cálculo aceita de 1 a 30 entregas por rota. O planejamento manual continua disponível.",
    );
  if (context.stops.some((s) => !confirmed(s)))
    throw new ApiError(
      422,
      "LOCATION_REQUIRED",
      "Confirme a localização de todas as entregas antes de calcular esta rota.",
    );
}
export function plannerBody(context: MapContext) {
  validateContext(context);
  return {
    mode: "drive",
    agents: [
      { id: context.driver_id, start_location: lngLat(context.origin!) },
    ],
    jobs: context.stops.map((s) => ({
      id: s.order_id,
      location: lngLat({latitude:Number(s.latitude),longitude:Number(s.longitude)}),
      duration: 0,
    })),
  };
}
export function normalizeRoute(
  value: unknown,
  context: MapContext,
  optimized: boolean,
): RouteCalculation {
  const parsed = external.safeParse(value);
  if (!parsed.success) throw unavailable();
  const data = parsed.data;
  if (
    Object.values(data.properties?.issues || {}).some(
      (v) => Array.isArray(v) && v.length,
    )
  )
    throw new ApiError(
      422,
      "INCOMPLETE_PLAN",
      "O otimizador não conseguiu atender todas as entregas. A sequência anterior foi mantida.",
    );
  const feature = data.features[0],
    p = feature.properties;
  let ids = context.stops.map((s) => s.order_id);
  if (optimized) {
    if (p.agent_index !== undefined && p.agent_index !== 0) throw unavailable();
    // Jobs are identified by real order IDs, including when several clients share a coordinate.
    ids = (p.actions || [])
      .filter((a) => a.job_id !== undefined || a.job_index !== undefined)
      .map((a) => a.job_id ?? context.stops[a.job_index!]?.order_id);
    if (
      ids.length !== context.stops.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !context.stops.some((s) => s.order_id === id))
    )
      throw new ApiError(
        422,
        "INCOMPLETE_PLAN",
        "A proposta não contém todas as entregas exatamente uma vez. Nada foi alterado.",
      );
  }
  const geo = geometry.safeParse(feature.geometry);
  const detailedPlannerGeometry =
    geo.success && (p.legs || []).some((l) => l.steps?.length);
  if (!optimized && !geo.success) throw unavailable();
  const legs = (p.legs || []).map((l) => ({
    distance: l.distance,
    duration: l.time,
  }));
  return {
    order_ids: ids,
    distance: p.distance,
    duration: p.time,
    // Matrix-only planner output is not a street-level polyline. Do not render straight waypoint links as navigation.
    geometry:
      geo.success && (!optimized || detailedPlannerGeometry) ? geo.data : null,
    legs: legs.length === context.stops.length ? legs : [],
  };
}
async function call(
  path: string,
  params: Record<string, string>,
  body?: unknown,
): Promise<unknown> {
  const key = process.env["GEOAPIFY_SERVER_KEY"];
  if (!key)
    throw new ApiError(
      503,
      "MAP_CONFIG",
      "Configure a chave privada Geoapify no servidor.",
    );
  const url = new URL(path, "https://api.geoapify.com");
  Object.entries({ ...params, apiKey: key }).forEach(([k, v]) =>
    url.searchParams.set(k, v),
  );
  try {
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      redirect: "error",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(35000),
    });
    if (response.status === 429)
      throw new ApiError(
        429,
        "MAP_QUOTA",
        "Limite temporário do provedor de mapas. Tente mais tarde.",
      );
    if (!response.ok) throw unavailable();
    const reader = response.body?.getReader();
    if (!reader) throw unavailable();
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2000000) {
        await reader.cancel();
        throw unavailable();
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      503,
      "MAP_UNAVAILABLE",
      "Não foi possível consultar os mapas agora. Seus dados salvos continuam disponíveis.",
    );
  }
}
export async function geocode(address: string): Promise<GeocodeCandidate[]> {
  const response = await call("/v1/geocode/search", {
    text: address,
    filter: "countrycode:br",
    format: "json",
    lang: "pt",
    limit: "5",
  });
  const schema = z.object({
    results: z
      .array(
        z.object({
          lat: z.number().min(-90).max(90),
          lon: z.number().min(-180).max(180),
          formatted: z.string().max(1000),
          city: z.string().optional(),
          result_type: z.string().optional(),
          rank: z
            .object({
              confidence: z.number().min(0).max(1).optional(),
              confidence_building_level: z.number().min(0).max(1).optional(),
            })
            .optional(),
        }),
      )
      .max(5),
  });
  const parsed = schema.safeParse(response);
  if (!parsed.success) throw unavailable();
  return parsed.data.results.map((r) => ({
    latitude: r.lat,
    longitude: r.lon,
    label: r.formatted,
    city: r.city || "",
    confidence: r.rank?.confidence || 0,
    precision: r.result_type || "unknown",
    approximate:
      !["building", "amenity"].includes(r.result_type || "") ||
      (r.rank?.confidence || 0) < 0.9 ||
      (r.rank?.confidence_building_level ?? 1) < 0.8,
  }));
}
export async function calculate(
  context: MapContext,
  optimize: boolean,
): Promise<RouteCalculation> {
  validateContext(context);
  if (optimize)
    return normalizeRoute(
      await call("/v1/routeplanner", {}, plannerBody(context)),
      context,
      true,
    );
  const waypoints = [context.origin!, ...context.stops]
    .map((p) => `${p.latitude},${p.longitude}`)
    .join("|");
  return normalizeRoute(
    await call("/v1/routing", {
      waypoints,
      mode: "drive",
      format: "geojson",
      units: "metric",
    }),
    context,
    false,
  );
}
