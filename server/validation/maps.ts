import {z} from "zod";
const coordinate = {
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
};
const version = z.iso.datetime({ offset: true });
export const baseSchema = z.strictObject({
  name: z.string().trim().min(2).max(160),
  address: z.string().trim().min(5).max(500),
  notes: z.string().trim().max(2000),
  ...coordinate,
  expected_updated_at: version.nullable(),
});
export const locationSchema = z.strictObject({
  id: z.uuid(),
  ...coordinate,
  expected_updated_at: version,
});
export const geocodeSchema = z.strictObject({
  address: z.string().trim().min(5).max(500),
});
export const mapRequestSchema = z.strictObject({
  route_id: z.uuid(),
  action: z.enum(["routing", "optimize", "cached"]),
  kind: z.enum(["routing", "optimize"]).optional(),
});
export const reorderSchema = z.strictObject({
  route_id: z.uuid(),
  order_ids: z.array(z.uuid()).min(1).max(200),
  expected_updated_at: version,
});
export const proposalSchema = z.strictObject({
  route_id: z.uuid(),
  proposal_id: z.uuid(),
  expected_updated_at: version,
});
