export type Role = "admin" | "driver";
export interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  created_at: string;
  updated_at: string;
}
export interface Establishment {
  id: string;
  name: string;
  trade_name: string;
  phone: string;
  contact_name: string;
  postal_code: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  full_address: string;
  latitude: number | null;
  longitude: number | null;
  location_status?: 'unconfigured' | 'review' | 'confirmed';
  location_confirmed_at?: string | null;
  notes: string;
  receiving_hours: string;
  active: boolean;
  updated_at: string;
}
export interface Product {
  id: string;
  name: string;
  unit: string;
  category_id: string;
  active: boolean;
  updated_at: string;
}
export interface ProductCategory { id: string; name: string; }
export interface MeasurementUnit { id: string; name: string; abbreviation: string; }
export interface OrderItem {
  id?: string;
  product_id: string | null;
  name: string;
  quantity: number;
  unit: string;
  unit_price: number | null;
  subtotal?: number;
  notes: string;
}
export interface Order {
  id: string;
  establishment_id: string;
  delivery_date: string;
  notes: string;
  status: "open" | "cancelled";
  total: number;
  created_by: string;
  updated_at: string;
  establishments?: Establishment;
  order_items?: OrderItem[];
  route_stops?: { route_id: string }[];
}
export interface RouteStop {
  id: string;
  route_id: string;
  order_id: string;
  position: number;
  status: import('./operations').StopStatus;
  orders?: Order;
}
export interface DeliveryRoute {
  id: string;
  driver_id: string;
  route_date: string;
  status: import('./operations').JourneyStatus;
  notes: string;
  updated_at: string;
  profiles?: Profile;
  route_stops?: RouteStop[];
}
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function subtotal(
  item: Pick<OrderItem, "quantity" | "unit_price">,
): number {
  const quantity = Number(item.quantity),
    price = Number(item.unit_price);
  if (
    !Number.isFinite(quantity) ||
    !Number.isFinite(price) ||
    quantity <= 0 ||
    price <= 0 ||
    quantity > 999999 ||
    price > 9999999
  )
    return 0;
  // Integer thousandths × cents, then half-up rounding matches PostgreSQL numeric.
  const milli = BigInt(Math.round(quantity * 1000));
  const cents = BigInt(Math.round(price * 100));
  return Number((milli * cents + 500n) / 1000n) / 100;
}
