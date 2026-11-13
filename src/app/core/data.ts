import { Injectable, inject } from "@angular/core";
import { Auth } from "./auth";
import {routeSelect} from '../../../shared/queries';
import type {
  DeliveryRoute,
  Establishment,
  Order,
  Product,
  ProductCategory,
  MeasurementUnit,
  Profile,
} from "../../../shared/models";
type DbResponse<T> = {
  data: T | null;
  error: { code?: string; message?: string } | null;
};
export function unwrap<T>(response: DbResponse<T>): T {
  if (response.error) {
    const code = response.error.code;
    if (code === "PGRST205" || code === "PGRST202")
      throw new Error(
        "O banco ainda precisa receber as migrations do EntregaLá. Consulte o README.",
      );
    if (code === "42501")
      throw new Error("Você não tem permissão para esta operação.");
    if (code?.startsWith("23"))
      throw new Error(
        "Confira os dados e os campos obrigatórios. Este registro pode estar em uso.",
      );
    throw new Error(
      "Não foi possível carregar ou salvar os dados. Verifique sua conexão e tente novamente.",
    );
  }
  return response.data as T;
}
@Injectable({ providedIn: "root" })
export class Data {
  private auth = inject(Auth);
  get db() {
    return this.auth.client;
  }
  async api<T>(path: string, body: unknown, method = "POST"): Promise<T> {
    const {
      data: { session },
    } = await this.db.auth.getSession();
    let response:Response;
    try{response = await fetch(`/api/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token || ""}`,
      },
      body: JSON.stringify(body),
    });}catch{throw new Error('Falha de conexão. Suas alterações foram mantidas; tente salvar novamente.');}
    const result = (await response.json()) as {
      data: T;
      error?: { message: string };
    };
    if (!response.ok)
      throw new Error(
        result.error?.message || "Não foi possível concluir a operação.",
      );
    return result.data;
  }
  async establishments(search = "", active: string = "all", page = 0) {
    let q = this.db
      .from("establishments")
      .select("*", { count: "exact" })
      .order("name");
    if (search) q = q.ilike("name", `%${search.replace(/[%_\\]/g, "")}%`);
    if (active !== "all") q = q.eq("active", active === "true");
    const result = await q.range(page * 25, page * 25 + 24);
    return {
      rows: unwrap(result) as Establishment[],
      count: result.count || 0,
    };
  }
  async activeEstablishments() {
    return unwrap(
      await this.db
        .from("establishments")
        .select("*")
        .eq("active", true)
        .order("name")
        .limit(1000),
    ) as Establishment[];
  }
  async products() {
    return unwrap(
      await this.db.from("products").select("*").order("name").limit(1000),
    ) as Product[];
  }
  async categories() {
    return unwrap(await this.db.from("product_categories").select("*").order("name").limit(1000)) as ProductCategory[];
  }
  async units() {
    return unwrap(await this.db.from("measurement_units").select("*").order("name").limit(1000)) as MeasurementUnit[];
  }
  async drivers() {
    return unwrap(
      await this.db
        .from("profiles")
        .select("*")
        .eq("role", "driver")
        .order("name")
        .limit(500),
    ) as Profile[];
  }
  async orders(date: string) {
    return unwrap(
      await this.db
        .from("orders")
        .select("*, establishments(*), order_items(*), route_stops(route_id)")
        .eq("delivery_date", date)
        .order("created_at", { ascending: false })
        .limit(1000),
    ) as Order[];
  }
  async order(id: string) {
    return unwrap(
      await this.db
        .from("orders")
        .select("*, establishments(*), order_items(*), route_stops(route_id)")
        .eq("id", id)
        .single(),
    ) as Order;
  }
  async routes(date?: string) {
    let q = this.db
      .from("routes")
      .select(
        routeSelect,
      )
      .order("created_at");
    if (date) q = q.eq("route_date", date);
    return unwrap(await q.limit(200)) as DeliveryRoute[];
  }
  async activeRoutes(){
    return unwrap(await this.db.from('routes').select(routeSelect).eq('status','in_progress').limit(20)) as DeliveryRoute[];
  }
}
