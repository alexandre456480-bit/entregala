import { Injectable, inject } from "@angular/core";
import { Data, unwrap } from "../data";
import type {
  MapContext,
  MapResult,
  OperationBase,
} from "../../../../shared/maps";
@Injectable({ providedIn: "root" })
export class MapsData {
  private data = inject(Data);
  async origin() {
    return unwrap(
      await this.data.db.from("operation_base").select("*").maybeSingle(),
    ) as OperationBase | null;
  }
  async context(id: string) {
    return unwrap(
      await this.data.db.rpc("map_context", { target: id }),
    ) as MapContext;
  }
  async cached(id: string, kind: "routing" | "optimize" = "routing") {
    return this.data.api<MapResult | null>("maps/route", {
      route_id: id,
      action: "cached",
      kind,
    });
  }
  calculate(id: string, action: "routing" | "optimize") {
    return this.data.api<MapResult>("maps/route", { route_id: id, action });
  }
  reorder(context: MapContext, ids: string[]) {
    return this.data.api("maps/reorder", {
      route_id: context.route_id,
      order_ids: ids,
      expected_updated_at: context.updated_at,
    });
  }
  apply(context: MapContext, proposal: MapResult) {
    return this.data.api("maps/apply", {
      route_id: context.route_id,
      proposal_id: proposal.id,
      expected_updated_at: context.updated_at,
    });
  }
}
