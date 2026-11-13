import { test } from "node:test";
import assert from "node:assert/strict";
import {
  progress,
  loadingProgress,
  productGroups,
  deliveryResult,
  type OperationalItem,
  type OperationalStop,
} from "../shared/operations";
import { operationSchema } from "../server/validation/operations";
const item = (p: Partial<OperationalItem> = {}): OperationalItem => ({
  id: "line-1",
  stop_id: "stop",
  original_item_id: "original",
  product_id: "tomate",
  name: "Tomate",
  unit: "kg",
  requested: 10,
  loaded: null,
  delivered: null,
  adjusted_name: "",
  adjusted_unit: "",
  load_reason: "",
  delivery_reason: "",
  notes: "",
  unit_price: 2,
  updated_at: "",
  ...p,
});
test("progresso separa integral, parcial, não realizada e atendimento", () => {
  const p = progress([
    { status: "delivered" },
    { status: "partial" },
    { status: "not_delivered" },
    { status: "in_service" },
  ]);
  assert.deepEqual(p, {
    total: 4,
    full: 1,
    partial: 1,
    failed: 1,
    treated: 3,
    remaining: 1,
    percent: 25,
    treatedPercent: 75,
  });
  assert.equal(progress([]).percent, 0);
});
test("consolidação usa identidade e unidade; fracionários em milésimos preservam vínculos", () => {
  const stops = [
    {
      id: "s1",
      establishment: { id: "e1" },
      items: [
        item({ requested: 0.1 }),
        item({ id: "other", product_id: "outro", requested: 5 }),
        item({ id: "box", unit: "caixa", requested: 2 }),
      ],
    },
    {
      id: "s2",
      establishment: { id: "e2" },
      items: [item({ id: "line2", requested: 0.2 })],
    },
  ] as OperationalStop[];
  const groups = productGroups(stops);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].requested, 0.3);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].establishments.size, 2);
  assert.equal(
    productGroups([
      {
        ...stops[0],
        items: [
          item({ product_id: null, original_item_id: "a" }),
          item({ product_id: null, original_item_id: "b" }),
        ],
      },
    ]).length,
    2,
  );
});
test("carga tratada não implica integral; substituição não conta como entrega original", () => {
  assert.deepEqual(
    loadingProgress([item({ loaded: 8 }), item({ loaded: 10 }), item()]),
    { total: 3, checked: 2, remaining: 1, differences: 1, percent: 67 },
  );
  assert.equal(deliveryResult([item({ delivered: 10 })]), "delivered");
  assert.equal(deliveryResult([item({ delivered: 8 })]), "partial");
  assert.equal(
    deliveryResult([item({ delivered: 10, adjusted_name: "Substituto" })]),
    "partial",
  );
  assert.equal(deliveryResult([item({ delivered: 0 })]), "not_delivered");
});
test("contrato rejeita campos comerciais, precisão, IDs, ações e valores inválidos", () => {
  const p = {
    action: "load_item",
    route_id: "00000000-0000-4000-8000-000000000001",
    request_id: "00000000-0000-4000-8000-000000000002",
    expected_version: 0,
    item_id: "00000000-0000-4000-8000-000000000003",
    quantity: 10,
    reason: "",
  };
  assert.ok(operationSchema.safeParse(p).success);
  for (const extra of [
    { unit_price: 1 },
    { quantity: -1 },
    { quantity: 1.00001 },
    { action: "set_status" },
    { item_id: "outro" },
    { expected_version: -1 },
  ])
    assert.equal(operationSchema.safeParse({ ...p, ...extra }).success, false);
});
