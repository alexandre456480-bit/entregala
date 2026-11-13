import { test } from "node:test";
import assert from "node:assert/strict";
import {
  plannerBody,
  normalizeRoute,
  validateContext,
  geocode,
} from "../server/services/geoapify/provider";
import { lngLat, navigationUrl, type MapContext } from "../shared/maps";
function context(n = 2): MapContext {
  return {
    route_id: "00000000-0000-4000-8000-000000000010",
    driver_id: "00000000-0000-4000-8000-000000000020",
    status: "released",
    updated_at: "2026-11-11T00:00:00Z",
    fingerprint: "test",
    origin: {
      name: "Base teste",
      address: "Endereço teste",
      latitude: -16.67,
      longitude: -49.25,
      notes: "",
      updated_at: "2026-11-11T00:00:00Z",
    },
    stops: Array.from({ length: n }, (_, i) => ({
      order_id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      establishment_id: `est-${i}`,
      name: `Teste ${i}`,
      address: "Endereço teste",
      latitude: -16.68,
      longitude: -49.26,
      position: i + 1,
      location_status: "confirmed",
    })),
  };
}
test("contrato Geoapify: 1,2,10,20,30 entregas; uma origem e destino final aberto", () => {
  for (const n of [1, 2, 10, 20, 30]) {
    const c = context(n),
      body = plannerBody(c);
    assert.equal(body.agents.length, 1);
    assert.equal(body.jobs.length, n);
    assert.deepEqual(body.agents[0].start_location, [-49.25, -16.67]);
    assert.ok(!("end_location" in body.agents[0]));
    assert.deepEqual(lngLat({latitude:Number(c.stops[0].latitude),longitude:Number(c.stops[0].longitude)}), [-49.26, -16.68]);
  }
});
test("IDs mantêm tarefas distintas em coordenadas iguais; plano incompleto e duplicado são recusados", () => {
  const c = context(2);
  const result = (ids: string[]) => ({
    type: "FeatureCollection",
    features: [
      {
        properties: {
          agent_index: 0,
          distance: 100,
          time: 30,
          actions: ids.map((job_id) => ({ type: "job", job_id })),
        },
      },
    ],
  });
  const ids = c.stops.map((s) => s.order_id).reverse();
  assert.deepEqual(normalizeRoute(result(ids), c, true).order_ids, ids);
  assert.throws(() => normalizeRoute(result([ids[0]]), c, true));
  assert.throws(() => normalizeRoute(result([ids[0], ids[0]]), c, true));
  assert.throws(() =>
    normalizeRoute(
      { ...result(ids), properties: { issues: { unassigned_jobs: [1] } } },
      c,
      true,
    ),
  );
  assert.throws(() =>
    normalizeRoute({ type: "FeatureCollection", features: [] }, c, true),
  );
});
test("origem, coordenadas confirmadas, número de paradas e links externos", () => {
  assert.throws(() => validateContext({ ...context(), origin: null }));
  assert.throws(() => validateContext(context(0)));
  assert.throws(() => validateContext(context(31)));
  const c = context();
  c.stops[0].location_status = "review";
  assert.throws(() => validateContext(c));
  const url = new URL(
    navigationUrl({
      latitude: -16,
      longitude: -49,
      location_status: "confirmed",
    }),
  );
  assert.equal(url.searchParams.get("destination"), "-16,-49");
  assert.equal(
    new URL(
      navigationUrl({
        latitude: null,
        longitude: null,
        full_address: "Rua teste, Goiânia",
      }),
    ).searchParams.get("destination"),
    "Rua teste, Goiânia",
  );
});
test("geocoding: inexistente, ambíguo, baixa confiança, formato inválido e falha sanitizada", async () => {
  const originalFetch = globalThis.fetch,
    key = process.env["GEOAPIFY_SERVER_KEY"];
  process.env["GEOAPIFY_SERVER_KEY"] = "server-test-only";
  try {
    for (const results of [
      [],
      [
        {
          lat: -16,
          lon: -49,
          formatted: "Centro de Goiânia",
          result_type: "city",
          rank: { confidence: 1 },
        },
      ],
      [
        {
          lat: -16,
          lon: -49,
          formatted: "Rua teste",
          result_type: "building",
          rank: { confidence: 0.2 },
        },
        {
          lat: -16.1,
          lon: -49.1,
          formatted: "Outra rua",
          result_type: "building",
          rank: { confidence: 0.9 },
        },
      ],
    ]) {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ results }), { status: 200 });
      const out = await geocode("Endereço teste");
      assert.equal(out.length, results.length);
      if (out.length) assert.equal(out[0].approximate, true);
    }
    globalThis.fetch = async () => new Response("{}", { status: 200 });
    await assert.rejects(geocode("Endereço teste"));
    globalThis.fetch = async () => {
      throw new Error("server-test-only");
    };
    await assert.rejects(
      geocode("Endereço teste"),
      (e) => e instanceof Error && !e.message.includes("server-test-only"),
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env["GEOAPIFY_SERVER_KEY"];
    else process.env["GEOAPIFY_SERVER_KEY"] = key;
  }
});
