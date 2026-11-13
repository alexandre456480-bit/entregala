import { Component, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { Data } from "../../core/data";
import { Feedback } from "../../core/feedback";
import { Icon } from "../../shared/icon";
import { Empty } from "../../shared/empty";
import { RouteTabs } from "./route-tabs";
import {journeyLabels} from '../../../../shared/operations';
import {
  today,
  type DeliveryRoute,
  type Order,
  type Profile,
} from "../../../../shared/models";
@Component({
  selector: "app-planner",
  imports: [ReactiveFormsModule, RouterLink, Icon, Empty, RouteTabs],
  templateUrl: "./planner.html",
})
export class Planner {
  readonly journeyLabels=journeyLabels;
  planningLocked(){return !!this.selected()&&this.selected()?.status!=='draft';}
  private data = inject(Data);
  private fb = inject(FormBuilder);
  private feedback = inject(Feedback);
  private activated = inject(ActivatedRoute);
  readonly date = this.fb.nonNullable.control(
    this.activated.snapshot.queryParamMap.get("data") || today(),
  );
  readonly routes = signal<DeliveryRoute[]>([]);
  readonly drivers = signal<Profile[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly selected = signal<DeliveryRoute | null | undefined>(undefined);
  readonly stops = signal<string[]>([]);
  readonly busy = signal(true);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly formError = signal("");
  readonly dirty = signal(false);
  readonly dragIndex = signal<number | null>(null);
  private loadedDate = this.date.value;
  private request = 0;
  canLeave() {
    if (this.saving()) { this.feedback.toast('Aguarde o salvamento da rota.'); return false; }
    return !this.dirty() || this.feedback.confirm("Descartar alterações?", "As alterações não salvas no planejamento serão perdidas.", "Descartar");
  }
  readonly form = this.fb.nonNullable.group({
    driver_id: ["", Validators.required],
    notes: ["", Validators.maxLength(2000)],
  });
  constructor() {
    void this.load();
    this.form.valueChanges.subscribe(() => {
      if (this.selected() !== undefined) this.dirty.set(true);
    });
  }
  async load() {
    if (!this.date.value) return;
    const request = ++this.request;
    const requestedDate = this.date.value;
    this.busy.set(true);
    this.error.set("");
    try {
      const [routes, orders, drivers] = await Promise.all([
        this.data.routes(requestedDate),
        this.data.orders(requestedDate),
        this.data.drivers(),
      ]);
      if (request !== this.request) return;
      this.loadedDate = requestedDate;
      this.routes.set(routes);
      this.orders.set(orders);
      this.drivers.set(drivers);
      const id =
        this.selected()?.id ||
        this.activated.snapshot.queryParamMap.get("rota");
      if (id) {
        const r = routes.find((r) => r.id === id);
        this.setSelected(r);
      }
    } catch (e) {
      if (request === this.request) this.error.set((e as Error).message);
    } finally {
      if (request === this.request) this.busy.set(false);
    }
  }
  async changeDate() {
    if (
      this.dirty() &&
      !(await this.feedback.confirm(
        "Descartar alterações?",
        "As alterações não salvas no planejamento serão perdidas.",
        "Descartar",
      ))
    ) {
      this.date.setValue(this.loadedDate, { emitEvent: false });
      return;
    }
    this.selected.set(undefined);
    this.dirty.set(false);
    await this.load();
  }
  async choose(route: DeliveryRoute | null) {
    if (
      this.dirty() &&
      !(await this.feedback.confirm(
        "Trocar de rota?",
        "Salve o planejamento antes de trocar ou descarte as alterações.",
        "Descartar",
      ))
    )
      return;
    this.setSelected(route);
  }
  private setSelected(route: DeliveryRoute | null | undefined) {
    this.selected.set(route);
    this.form.reset({
      driver_id: route?.driver_id || "",
      notes: route?.notes || "",
    });
    this.stops.set(
      [...(route?.route_stops || [])]
        .sort((a, b) => a.position - b.position)
        .map((s) => s.order_id),
    );
    this.formError.set("");
    this.dirty.set(false);
  }
  available() {
    return this.orders().filter(
      (o) =>
        o.status === "open" &&
        !o.route_stops?.length &&
        !this.stops().includes(o.id),
    );
  }
  order(id: string) {
    return this.orders().find((o) => o.id === id);
  }
  add(id: string) {
    this.stops.update((ids) => [...ids, id]);
    this.dirty.set(true);
  }
  remove(id: string) {
    this.stops.update((ids) => ids.filter((i) => i !== id));
    this.dirty.set(true);
  }
  move(index: number, delta: number) {
    const ids = [...this.stops()];
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    this.stops.set(ids);
    this.dirty.set(true);
  }
  drop(target: number, event: DragEvent) {
    event.preventDefault();
    const from = this.dragIndex();
    if (from === null || from === target) return;
    const ids = [...this.stops()];
    const [id] = ids.splice(from, 1);
    ids.splice(target, 0, id);
    this.stops.set(ids);
    this.dragIndex.set(null);
    this.dirty.set(true);
  }
  summary() {
    const totals = new Map<
      string,
      { name: string; unit: string; quantity: number }
    >();
    for (const id of this.stops())
      for (const item of this.order(id)?.order_items || []) {
        const key = item.name + "|" + item.unit;
        const prev = totals.get(key);
        totals.set(key, {
          name: item.name,
          unit: item.unit,
          quantity:
            Math.round(((prev?.quantity || 0) + Number(item.quantity)) * 1000) /
            1000,
        });
      }
    return [...totals.values()];
  }
  async deleteRoute() {
    const route = this.selected();
    if (!route || this.saving()) return;
    if (!(await this.feedback.confirm("Excluir rota?", "A rota será excluída e seus pedidos voltarão a ficar sem rota. Alterações não salvas serão perdidas. Esta ação não pode ser desfeita.", "Excluir rota"))) return;
    this.saving.set(true);
    this.formError.set("");
    try {
      await this.data.api("routes", { id: route.id, expected_updated_at: route.updated_at }, "PATCH");
      this.setSelected(undefined);
      await this.load();
      this.feedback.toast("Rota excluída. Os pedidos estão disponíveis para outra rota.");
    } catch (e) { this.formError.set((e as Error).message); }
    finally { this.saving.set(false); }
  }
  async save(release = false) {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.formError.set("Selecione um motorista ativo.");
      return;
    }
    if (
      release &&
      !(await this.feedback.confirm(
        "Liberar rota para o motorista?",
        "Confira o motorista, os pedidos e a ordem das paradas. A rota ficará disponível para consulta e não poderá ser editada nesta fase.",
        "Liberar rota",
      ))
    )
      return;
    this.saving.set(true);
    this.formError.set("");
    try {
      const selected = this.selected();
      const id = await this.data.api<string>("routes", {
        ...this.form.getRawValue(),
        id: selected?.id || null,
        route_date: this.date.value,
        status: release ? "released" : "draft",
        expected_updated_at: selected?.updated_at || null,
        order_ids: this.stops(),
      });
      this.dirty.set(false);
      await this.load();
      this.setSelected(this.routes().find((r) => r.id === id));
      this.feedback.toast(
        release ? "Rota liberada para o motorista." : "Planejamento salvo.",
      );
    } catch (e) {
      this.formError.set((e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
