import { Component, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { Data, unwrap } from "../../core/data";
import { Auth } from "../../core/auth";
import { Icon } from "../../shared/icon";
import { Empty } from "../../shared/empty";
import {OperationsMonitor} from '../operations/operations-monitor';
import { today, type DeliveryRoute } from "../../../../shared/models";
@Component({
  selector: "app-dashboard",
  imports: [RouterLink, Icon, Empty,OperationsMonitor],
  templateUrl: "./dashboard.html",
})
export class Dashboard {
  readonly auth = inject(Auth);
  private data = inject(Data);
  readonly busy = signal(true);
  readonly error = signal("");
  readonly stats = signal({
    establishments: 0,
    orders: 0,
    routes: 0,
    drivers: 0,
    unassigned: 0,
  });
  readonly routes = signal<DeliveryRoute[]>([]);
  constructor() {
    void this.load();
  }
  async load() {
    this.busy.set(true);
    this.error.set("");
    try {
      const [est, orders, routes] = await Promise.all([
        this.data.db
          .from("establishments")
          .select("id", { count: "exact", head: true }),
        this.data.orders(today()),
        this.data.routes(today()),
      ]);
      unwrap(est);
      this.routes.set(routes);
      this.stats.set({
        establishments: est.count || 0,
        orders: orders.filter((o) => o.status === "open").length,
        routes: routes.length,
        drivers: new Set(routes.map((r) => r.driver_id)).size,
        unassigned: orders.filter(
          (o) => o.status === "open" && !o.route_stops?.length,
        ).length,
      });
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
