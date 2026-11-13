import { z } from "zod";
const id = z.uuid(),
  reason = z.string().trim().max(1000),
  quantity = z
    .number()
    .finite()
    .min(0)
    .max(999999)
    .refine(
      (v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6,
      "Use até três casas decimais.",
    );
const base = {
  route_id: id,
  request_id: id,
  expected_version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
};
export const operationSchema = z.union([
  z.object({...base, action:z.literal('uncheck_load'), item_id:id}).strict(),
  ...(
    [
      "begin_loading",
      "serve",
      "start",
      "finish",
      "finish_stop",
      "reopen_stop",
    ] as const
  ).map((action) =>
    z
      .object({
        ...base,
        action: z.literal(action),
        stop_id: id.optional(),
        reason: reason.optional(),
        acknowledge: z.boolean().optional(),
      })
      .strict(),
  ),
  ...(["load_item", "deliver_item", "adjust_item"] as const).map((action) =>
    z
      .object({
        ...base,
        action: z.literal(action),
        item_id: id,
        quantity,
        reason,
        allow_excess: z.boolean().optional(),
        name: z.string().trim().max(160).optional(),
        unit: z.string().trim().max(20).optional(),
      })
      .strict(),
  ),
  z
    .object({
      ...base,
      action: z.literal("load_group"),
      item_ids: z.array(id).min(1).max(100),
      acknowledge: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("add_item"),
      stop_id: id,
      quantity: quantity.refine((v) => v > 0),
      name: z.string().trim().min(2).max(160),
      unit: z.string().trim().min(1).max(20),
      reason: reason.min(3),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("issue"),
      stop_id: id.optional(),
      item_id: id.optional(),
      category: z.enum([
        "closed",
        "unavailable",
        "missing",
        "quantity",
        "refused",
        "address",
        "substitution",
        "other",
      ]),
      phase: z.enum(["loading", "delivery", "journey"]),
      reason,
    })
    .strict(),
]);
