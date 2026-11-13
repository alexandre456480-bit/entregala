import { Component, inject, signal, computed, DestroyRef, viewChild } from "@angular/core";
import { OperationsData } from "../../core/operations/operations-data";
import { ReactiveFormsModule, FormBuilder } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { Data } from "../../core/data";
import { MapsData } from "../../core/maps/maps-data";
import { RouteWorkspace } from "./route-workspace";
import { RouteMap } from "../../shared/maps/route-map";
import { Empty } from "../../shared/empty";
import { Feedback } from "../../core/feedback";
import { RouteTabs } from "../routes/route-tabs";
import { today, type DeliveryRoute } from "../../../../shared/models";
import { journeyLabels } from "../../../../shared/operations";
import {
  confirmed,
  routeColor,
  type MapPoint,
  type MapResult,
  type OperationBase,
} from "../../../../shared/maps";
@Component({
  selector: "app-map-board",
  imports: [ReactiveFormsModule, RouterLink, RouteWorkspace, RouteMap, Empty, RouteTabs],
  template: `<app-route-tabs active="map" [date]="date.value" [route]="selected()" />
    <div class="page-heading">
      <div>
        <span class="eyebrow">OPERAÇÃO NO MAPA</span>
        <h1>Cada motorista, seu caminho<span class="greeting-dot">.</span></h1>
        <p>Visualize, organize e otimize cada rota individualmente.</p>
      </div>
    </div>
    <div class="toolbar">
      <label class="inline-label"
        >Dia das entregas<input
          type="date"
          [formControl]="date"
          (change)="load()" /></label
      ><a routerLink="/admin/base" class="text-button"
        >Configurar base da distribuidora</a
      >
    </div>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (busy()) {
      <div class="skeleton list-skeleton"></div>
    } @else {
      <div class="driver-legends" aria-label="Rotas por motorista">
        @for (r of routes(); track r.id) {
          <div class="driver-legend" [class.selected]="selected() === r.id">
            <span
              class="route-color"
              [style.background]="selected() === r.id ? '#FFA51F' : color(r.driver_id)"
            ></span
            ><button type="button" (click)="choose(r.id)">
              <strong>{{ r.profiles?.name }}</strong><small
                >{{ r.route_stops?.length || 0 }} paradas ·
                {{ labels[r.status] }}</small
              ></button
            ><input
              type="checkbox"
              [attr.aria-label]="'Exibir rota de ' + r.profiles?.name"
              [checked]="visible().has(r.id)"
              [disabled]="selected() === r.id"
              (change)="toggle(r.id)"
            />
          </div>
        }
      </div>
      @if (selected()) {
        <app-route-workspace
          [routeId]="selected()"
          [extraPoints]="points()"
          [focusOrder]="selectedOrder()"
          [extraLines]="lines()"
          (pointChosen)="selectPoint($event)"
          (changed)="refreshData()"
        />
      } @else {
        <section class="panel">
          <app-route-map [points]="basePoints()" /><app-empty
            title="O mapa está pronto para seus destinos"
            message="Crie uma rota no planejamento para visualizar suas entregas."
            icon="route"
            ><a class="button primary" routerLink="/admin/rotas"
              >Planejar rota</a
            ></app-empty
          >
        </section>
      }
    }`,
})
export class MapBoard {
  private readonly workspace=viewChild(RouteWorkspace);
  private readonly feedback=inject(Feedback);
  canLeave(){
    const workspace=this.workspace();
    if(workspace?.busy()){this.feedback.toast('Aguarde a conclusão da operação.');return false;}
    return !workspace?.manualDirty() || this.feedback.confirm('Descartar alterações?', 'A ordem das paradas ainda não foi salva.', 'Descartar');
  }
  readonly selectedOrder = signal("");
  private data = inject(Data);
  private maps = inject(MapsData);
  private fb = inject(FormBuilder);
  private activated = inject(ActivatedRoute);
  readonly date = this.fb.nonNullable.control(
    this.activated.snapshot.queryParamMap.get("data") || today(),
  );
  readonly routes = signal<DeliveryRoute[]>([]);
  readonly base = signal<OperationBase | null>(null);
  readonly selected = signal(
    this.activated.snapshot.queryParamMap.get("rota") || "",
  );
  readonly visible = signal(new Set<string>());
  readonly cached = signal<Record<string, MapResult>>({});
  readonly busy = signal(true);
  readonly error = signal("");
  private request = 0;
  readonly color = routeColor;
  readonly labels = journeyLabels;
  readonly points = computed<MapPoint[]>(() =>
    this.routes()
      .filter((r) => r.id !== this.selected() && this.visible().has(r.id))
      .flatMap((r) =>
        (r.route_stops || []).flatMap((s) => {
          const e = s.orders?.establishments;
          return e && confirmed(e)
            ? [
                {
                  id: s.order_id,
                  label: `${r.profiles?.name}: ${e.name}`,
                  latitude: Number(e.latitude),
                  longitude: Number(e.longitude),
                  number: s.position,
                  color: routeColor(r.driver_id),
                  status: s.status,
                },
              ]
            : [];
        }),
      ),
  );
  readonly lines = computed(() =>
    this.routes()
      .filter(
        (r) =>
          r.id !== this.selected() &&
          this.visible().has(r.id) &&
          this.cached()[r.id]?.result.geometry,
      )
      .map((r) => ({
        id: r.id,
        color: routeColor(r.driver_id),
        geometry: this.cached()[r.id].result.geometry!,
      })),
  );
  constructor() {
    void this.load();
    const stop = inject(OperationsData).watch(() => {
      if (!this.busy()) void this.refreshData();
    });
    inject(DestroyRef).onDestroy(stop);
  }
  basePoints(): MapPoint[] {
    const b = this.base();
    return b ? [{ ...b, id: "origin", label: b.name, origin: true }] : [];
  }
  async refreshData() {
    try {
      const routes = await this.data.routes(this.date.value);
      this.routes.set(routes);
      const results = await Promise.all(
        routes.map(async (r) => [r.id, await this.maps.cached(r.id)] as const),
      );
      this.cached.set(
        Object.fromEntries(
          results.filter(
            (r): r is readonly [string, MapResult] => r[1] !== null,
          ),
        ),
      );
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
  async load() {
    if (!this.date.value) return;
    const request = ++this.request;
    this.busy.set(true);
    this.error.set("");
    try {
      const [routes, base] = await Promise.all([
        this.data.routes(this.date.value),
        this.maps.origin(),
      ]);
      if (request !== this.request) return;
      this.routes.set(routes);
      this.base.set(base);
      this.visible.set(new Set(routes.map((r) => r.id)));
      if (!routes.some((r) => r.id === this.selected()))
        this.selected.set(routes[0]?.id || "");
      const cached = await Promise.all(
        routes.map(async (r) => [r.id, await this.maps.cached(r.id)] as const),
      );
      if (request === this.request)
        this.cached.set(
          Object.fromEntries(
            cached.filter(
              (entry): entry is readonly [string, MapResult] =>
                entry[1] !== null,
            ),
          ),
        );
    } catch (e) {
      if (request === this.request) this.error.set((e as Error).message);
    } finally {
      if (request === this.request) this.busy.set(false);
    }
  }
  choose(id: string) {
    this.selectedOrder.set("");
    this.selected.set(id);
    this.visible.update((set) => new Set([...set, id]));
  }
  toggle(id: string) {
    this.visible.update((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  selectPoint(id: string) {
    const route = this.routes().find((r) =>
      r.route_stops?.some((s) => s.order_id === id),
    );
    if (route) {
      this.choose(route.id);
      this.selectedOrder.set(id);
    }
  }
}
