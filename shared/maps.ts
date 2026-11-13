export interface Coordinates {
  latitude: number;
  longitude: number;
}
export interface OperationBase extends Coordinates {
  name: string;
  address: string;
  notes: string;
  updated_at: string;
}
export interface MapStop {
  status?:import('./operations').StopStatus;
  latitude:number|null;
  longitude:number|null;
  order_id: string;
  establishment_id: string;
  name: string;
  address: string;
  position: number;
  location_status: string;
}
export interface MapContext {
  route_id: string;
  driver_id: string;
  status: string;
  updated_at: string;
  fingerprint: string;
  origin: OperationBase | null;
  stops: MapStop[];
}
export interface RouteGeometry {
  type: "LineString" | "MultiLineString";
  coordinates: number[][] | number[][][];
}
export interface RouteCalculation {
  order_ids: string[];
  distance: number;
  duration: number;
  legs: { distance: number; duration: number }[];
  geometry: RouteGeometry | null;
}
export interface MapResult {
  id: string;
  fingerprint: string;
  kind: "routing" | "optimize";
  created_at?: string;
  result: RouteCalculation;
}
export interface GeocodeCandidate extends Coordinates {
  label: string;
  confidence: number;
  precision: string;
  city: string;
  approximate: boolean;
}
export interface MapPoint extends Coordinates {
  status?:import('./operations').StopStatus;
  id: string;
  label: string;
  number?: number;
  origin?: boolean;
  destination?: boolean;
  confirmed?: boolean;
  color?: string;
}
export function lngLat(point: Coordinates): [number, number] {
  return [Number(point.longitude), Number(point.latitude)];
}
export function confirmed(point: {
  latitude: number | null;
  longitude: number | null;
  location_status?: string;
}): boolean {
  return (
    point.location_status === "confirmed" &&
    point.latitude !== null &&
    point.longitude !== null &&
    Number.isFinite(Number(point.latitude)) &&
    Number.isFinite(Number(point.longitude))
    &&Number(point.latitude)>=-90&&Number(point.latitude)<=90&&Number(point.longitude)>=-180&&Number(point.longitude)<=180
  );
}
export function navigationUrl(point: {
  latitude: number | null;
  longitude: number | null;
  location_status?: string;
  full_address?: string;
}): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("travelmode", "driving");
  url.searchParams.set(
    "destination",
    confirmed(point)
      ? `${point.latitude},${point.longitude}`
      : point.full_address || "",
  );
  return url.toString();
}
export function routeColor(id: string): string {
  const colors = [
    "#36d9c5",
    "#ff8d64",
    "#68b5ff",
    "#d1a4ff",
    "#b6d94e",
    "#ff809c",
  ];
  return colors[
    [...id].reduce((v, c) => (v * 31 + c.charCodeAt(0)) >>> 0, 0) %
      colors.length
  ];
}
