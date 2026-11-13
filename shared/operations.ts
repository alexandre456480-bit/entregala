import type { Establishment, Order, OrderItem } from "./models";
export type JourneyStatus =
  "draft" | "released" | "loading" | "in_progress" | "completed";
export type StopStatus =
  "pending" | "in_service" | "delivered" | "partial" | "not_delivered";
export const journeyLabels: Record<JourneyStatus, string> = {
  draft: "Rascunho",
  released: "Liberada",
  loading: "Em carregamento",
  in_progress: "Em andamento",
  completed: "Finalizada",
};
export const stopLabels: Record<StopStatus, string> = {
  pending: "Pendente",
  in_service: "Em atendimento",
  delivered: "Entregue",
  partial: "Parcialmente entregue",
  not_delivered: "Não realizada",
};
export const issueLabels = {
  closed: "Estabelecimento fechado",
  unavailable: "Cliente não disponível",
  missing: "Produto faltando",
  quantity: "Quantidade divergente",
  refused: "Produto recusado",
  address: "Endereço incorreto",
  substitution: "Produto substituído",
  other: "Outro problema",
};
export interface OperationalItem {
  id: string;
  stop_id: string;
  original_item_id: string | null;
  product_id: string | null;
  name: string;
  unit: string;
  requested: number;
  loaded: number | null;
  delivered: number | null;
  adjusted_name: string;
  adjusted_unit: string;
  load_reason: string;
  delivery_reason: string;
  notes: string;
  unit_price: number | null;
  updated_at: string;
}
export interface OperationalStop {
  id: string;
  order_id: string;
  position: number;
  status: StopStatus;
  served_at: string | null;
  finished_at: string | null;
  order: Order;
  establishment: Establishment;
  items: OperationalItem[];
  original_items: OrderItem[];
}
export interface OperationIssue {
  id: string;
  stop_id: string | null;
  item_id: string | null;
  category: keyof typeof issueLabels;
  description: string;
  phase: string;
  created_at: string;
  actor_id: string;
}
export interface OperationContext {
  id: string;
  driver_id: string;
  driver_name: string;
  route_date: string;
  status: JourneyStatus;
  operation_version: number;
  updated_at: string;
  loading_started_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  stops: OperationalStop[];
  issues: OperationIssue[];
  history: {
    operation: string;
    created_at: string;
    actor_id: string;
    changes: Record<string, unknown>;
  }[];
}
export function terminal(s: StopStatus) {
  return ["delivered", "partial", "not_delivered"].includes(s);
}
export function progress(stops: Pick<OperationalStop, "status">[]) {
  const total = stops.length,
    full = stops.filter((s) => s.status === "delivered").length,
    partial = stops.filter((s) => s.status === "partial").length,
    failed = stops.filter((s) => s.status === "not_delivered").length,
    treated = full + partial + failed;
  return {
    total,
    full,
    partial,
    failed,
    treated,
    remaining: total - treated,
    percent: total ? Math.round((full / total) * 100) : 0,
    treatedPercent: total ? Math.round((treated / total) * 100) : 0,
  };
}
export function loadDifference(i: OperationalItem) {
  return (
    i.loaded !== null &&
    (Number(i.loaded) !== Number(i.requested) ||
      !!i.adjusted_name ||
      !!i.adjusted_unit)
  );
}
export function loadingProgress(items: OperationalItem[]) {
  const checked = items.filter((i) => i.loaded !== null).length;
  return {
    total: items.length,
    checked,
    remaining: items.length - checked,
    differences: items.filter(loadDifference).length,
    percent: items.length ? Math.round((checked / items.length) * 100) : 0,
  };
}
export function deliveryResult(items: OperationalItem[]): StopStatus {
  return !items.some((i) => Number(i.delivered) > 0)
    ? "not_delivered"
    : items.every(
          (i) =>
            i.delivered !== null &&
            Number(i.delivered) === Number(i.requested) &&
            !i.adjusted_name &&
            !i.adjusted_unit,
        )
      ? "delivered"
      : "partial";
}
export function productGroups(stops: OperationalStop[]) {
  const groups = new Map<
    string,
    {
      key: string;
      name: string;
      unit: string;
      requested: number;
      loaded: number;
      items: OperationalItem[];
      establishments: Set<string>;
    }
  >();
  for (const s of stops)
    for (const i of s.items) {
      const key = [
        i.product_id || i.original_item_id || i.id,
        i.unit,
        i.adjusted_name,
        i.adjusted_unit,
      ].join("|");
      const g = groups.get(key) || {
        key,
        name: i.adjusted_name || i.name,
        unit: i.adjusted_unit || i.unit,
        requested: 0,
        loaded: 0,
        items: [],
        establishments: new Set<string>(),
      };
      g.requested += Math.round(Number(i.requested) * 1000);
      g.loaded += Math.round(Number(i.loaded || 0) * 1000);
      g.items.push(i);
      g.establishments.add(s.establishment.id);
      groups.set(key, g);
    }
  return [...groups.values()].map((g) => ({
    ...g,
    requested: g.requested / 1000,
    loaded: g.loaded / 1000,
  }));
}
