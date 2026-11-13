import {
  Component,
  input,
  output,
  inject,
  signal,
  effect,
  computed,
} from "@angular/core";
import { CurrencyPipe } from "@angular/common";
import { MapsData } from "../../core/maps/maps-data";
import { Data } from "../../core/data";
import { Feedback } from "../../core/feedback";
import { RouteMap } from "../../shared/maps/route-map";
import { Icon } from "../../shared/icon";
import { OperationsData } from "../../core/operations/operations-data";
import { stopLabels } from "../../../../shared/operations";
import {
  confirmed,
  navigationUrl,
  type MapContext,
  type MapResult,
  type MapPoint,
} from "../../../../shared/maps";
import type { Order } from "../../../../shared/models";
@Component({
  selector: "app-route-workspace",
  imports: [RouteMap, Icon, CurrencyPipe],
  templateUrl: "./route-workspace.html",
})
export class RouteWorkspace {
  readonly stopLabels = stopLabels;
  private operations = inject(OperationsData);
  readonly focusOrder = input("");
  readonly routeId = input.required<string>();
  readonly primaryColor = input('#FFA51F');
  readonly extraPoints = input<MapPoint[]>([]);
  readonly changed = output<void>();
  readonly pointChosen = output<string>();
  readonly extraLines = input<
    {
      id: string;
      color: string;
      geometry: import("../../../../shared/maps").RouteGeometry;
    }[]
  >([]);
  private maps = inject(MapsData);
  private data = inject(Data);
  private feedback = inject(Feedback);
  readonly context = signal<MapContext | null>(null);
  readonly current = signal<MapResult | null>(null);
  readonly proposal = signal<MapResult | null>(null);
  readonly ids = signal<string[]>([]);
  readonly selected = signal("");
  readonly order = signal<Order | null>(null);
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly error = signal("");
  readonly manualDirty = signal(false);
  readonly view = signal<"map" | "list">("map");
  private request = 0;
  private detailRequest = 0;
  private refreshSequence = 0;
  private dragIndex: number | null = null;
  readonly displayIds = computed(
    () => this.proposal()?.result.order_ids || this.ids(),
  );
  readonly points = computed<MapPoint[]>(() => {
    const c = this.context();
    if (!c) return this.extraPoints();
    const own = this.displayIds()
      .map((id, i) => {
        const p = c.stops.find((s) => s.order_id === id);
        return p && confirmed(p)
          ? {
              ...p,
              latitude: Number(p.latitude),
              longitude: Number(p.longitude),
              id,
              label: p.name,
              number: i + 1,
              destination: i === this.displayIds().length - 1,
              color: this.primaryColor(),
            }
          : null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
    return [
      ...this.extraPoints().filter((p) => !own.some((o) => o.id === p.id)),
      ...(c.origin
        ? [{ ...c.origin, id: "origin", label: c.origin.name, origin: true }]
        : []),
      ...own,
    ];
  });
  readonly lines = computed(() => {
    const result =
      this.proposal() || (!this.manualDirty() ? this.current() : null);
    const geometry = result?.result.geometry;
    return [
      ...this.extraLines(),
      ...(geometry
        ? [
            {
              id: this.routeId(),
              color: this.primaryColor(),
              geometry,
            },
          ]
        : []),
    ];
  });
  readonly framePoints = computed(() => {
    const ids = new Set(this.context()?.stops.map((s) => s.order_id) || []);
    return this.points().filter((p) => p.origin || ids.has(p.id));
  });
  constructor() {
    effect(() => {
      const id = this.focusOrder(),
        context = this.context();
      if (id && context?.stops.some((s) => s.order_id === id))
        void this.select(id);
    });
    effect((cleanup) => {
      const id = this.routeId();
      void this.load(id);
      const stop = this.operations.watch(() => {
        if (!this.manualDirty() && !this.busy() && !this.loading())
          void this.refreshContext(id);
      }, id);
      cleanup(stop);
    });
  }
  async load(id = this.routeId()) {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set("");
    this.context.set(null);
    this.proposal.set(null);
    this.current.set(null);
    this.order.set(null);
    this.selected.set("");
    this.manualDirty.set(false);
    try {
      const c = await this.maps.context(id);
      if (request !== this.request) return;
      this.context.set(c);
      this.ids.set(c.stops.map((s) => s.order_id));
      const cached = await this.maps.cached(id);
      if (request === this.request) this.current.set(cached);
    } catch (e) {
      if (request === this.request) this.error.set((e as Error).message);
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
  private async refreshContext(id: string) {
    const sequence = ++this.refreshSequence,
      request = this.request;
    try {
      const c = await this.maps.context(id);
      if (
        id !== this.routeId() ||
        request !== this.request ||
        sequence !== this.refreshSequence ||
        this.busy() ||
        this.manualDirty()
      )
        return;
      const previous = this.context();
      if (
        c.updated_at === previous?.updated_at &&
        c.fingerprint === previous.fingerprint
      )
        return;
      this.context.set(c);
      this.ids.set(c.stops.map((s) => s.order_id));
      if (
        c.status === "completed" ||
        c.stops.some((s) => s.status && s.status !== "pending")
      )
        this.proposal.set(null);
      if (c.fingerprint !== previous?.fingerprint) {
        this.proposal.set(null);
        this.current.set(null);
        const cached = await this.maps.cached(id);
        if (
          request === this.request &&
          sequence === this.refreshSequence &&
          !this.manualDirty()
        )
          this.current.set(cached);
      }
    } catch (e) {
      if (request === this.request) this.error.set((e as Error).message);
    }
  }
  stop(id: string) {
    return this.context()?.stops.find((s) => s.order_id === id);
  }
  missing() {
    return this.context()?.stops.filter((s) => !confirmed(s)).length || 0;
  }
  canCalculate() {
    const c = this.context();
    return (
      !!c?.origin &&
      !this.missing() &&
      c.stops.length > 0 &&
      c.stops.length <= 30 &&
      !this.manualDirty()
    );
  }
  async select(id: string) {
    if (!this.context()?.stops.some((s) => s.order_id === id)) {
      this.pointChosen.emit(id);
      return;
    }
    this.selected.set(id);
    const request = ++this.detailRequest;
    try {
      const order = await this.data.order(id);
      if (request === this.detailRequest) this.order.set(order);
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
  move(index: number, delta: number) {
    const target = index + delta;
    if (
      target < 0 ||
      target >= this.ids().length ||
      !this.movable(this.ids()[index]) ||
      !this.movable(this.ids()[target])
    )
      return;
    const ids = [...this.ids()];
    [ids[index], ids[target]] = [ids[target], ids[index]];
    this.ids.set(ids);
    this.manualDirty.set(true);
    this.proposal.set(null);
  }
  drag(index: number) {
    this.dragIndex = this.movable(this.ids()[index]) ? index : null;
  }
  drop(index: number, event: DragEvent) {
    event.preventDefault();
    if (this.dragIndex === null || !this.movable(this.ids()[index])) return;
    const ids = [...this.ids()];
    const [id] = ids.splice(this.dragIndex, 1);
    ids.splice(index, 0, id);
    if (ids.some((id, i) => !this.movable(id) && this.ids()[i] !== id)) {
      this.dragIndex = null;
      return;
    }
    this.ids.set(ids);
    this.dragIndex = null;
    this.manualDirty.set(true);
    this.proposal.set(null);
  }
  async calculate(optimize = false) {
    if (
      this.busy() ||
      !this.canCalculate() ||
      (optimize && !this.canOptimize())
    )
      return;
    this.busy.set(true);
    this.error.set("");
    try {
      const result = await this.maps.calculate(
        this.routeId(),
        optimize ? "optimize" : "routing",
      );
      if (optimize) this.proposal.set(result);
      else this.current.set(result);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  async saveManual() {
    const c = this.context();
    if (!c || this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    try {
      await this.maps.reorder(c, this.ids());
      await this.load();
      this.changed.emit();
      this.feedback.toast("Sequência salva. Calcule o trajeto quando desejar.");
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  async apply() {
    const c = this.context(),
      p = this.proposal();
    if (!c || !p || this.busy()) return;
    if (
      !(await this.feedback.confirm(
        "Aplicar rota otimizada?",
        "Todas as entregas e o motorista serão preservados. Somente a ordem será alterada.",
        "Aplicar rota otimizada",
      ))
    )
      return;
    this.busy.set(true);
    try {
      await this.maps.apply(c, p);
      await this.load();
      this.changed.emit();
      this.feedback.toast("Rota otimizada aplicada.");
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  distance(m: number) {
    return `${(m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
  }
  duration(s: number) {
    const min = Math.ceil(s / 60);
    return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}min` : `${min} min`;
  }
  navigate = navigationUrl;
  movable(id: string) {
    return (
      this.context()?.status !== "completed" &&
      (!this.stop(id)?.status || this.stop(id)?.status === "pending")
    );
  }
  canOptimize() {
    return (
      this.context()?.status !== "completed" &&
      !this.context()?.stops.some((s) => s.status && s.status !== "pending") &&
      this.canCalculate()
    );
  }
}
