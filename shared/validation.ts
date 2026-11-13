import { z } from "zod";
const text = (max: number) => z.string().trim().max(max);
const name = text(160).min(2);
const id = z.uuid();
const date = z.iso.date();
export const itemSchema = z.strictObject({
  product_id: id.nullable(),
  name,
  quantity: z.number().positive().max(999999).multipleOf(0.001),
  unit: text(20).min(1),
  unit_price: z.number().min(0).max(9999999).multipleOf(0.01).nullable(),
  notes: text(1000),
});
export const orderSchema = z.strictObject({
  id: id.nullable(),
  establishment_id: id,
  delivery_date: date,
  notes: text(2000),
  status: z.enum(["open", "cancelled"]),
  expected_updated_at: z.iso.datetime({ offset: true }).nullable(),
  route_id: id.nullable(),
  items: z.array(itemSchema).min(1).max(100),
});
export const driverSchema = z.strictObject({
  name,
  email: z.email().max(254),
  password: z.string().min(12).max(128),
});
export const driverStatusSchema = z.strictObject({ id, active: z.boolean() });
export const routeSchema = z.strictObject({
  id: id.nullable(),
  driver_id: id,
  route_date: date,
  notes: text(2000),
  status: z.enum(["draft", "released"]),
  expected_updated_at: z.iso.datetime({ offset: true }).nullable(),
  order_ids: z
    .array(id)
    .max(200)
    .refine((ids) => new Set(ids).size === ids.length, "Pedido duplicado"),
});

export const deleteRouteSchema = z.strictObject({ id, expected_updated_at: z.iso.datetime({ offset: true }) });
export const deleteOrderSchema = deleteRouteSchema.extend({ expected_route_id: id.nullable() });
