import { Component, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { CurrencyPipe, DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { Data } from "../../core/data";
import { Feedback } from "../../core/feedback";
import { Icon } from "../../shared/icon";
import { Empty } from "../../shared/empty";
import { today, type Order } from "../../../../shared/models";
@Component({
  selector: "app-orders",
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CurrencyPipe,
    DatePipe,
    Icon,
    Empty,
  ],
  template: `
    <div class="page-heading">
      <div>
        <span class="eyebrow">DA DISTRIBUIDORA PARA O CLIENTE</span>
        <h1>Pedidos<span class="greeting-dot">.</span></h1>
        <p>Uma visão clara de tudo o que precisa chegar.</p>
      </div>
      <a class="button primary" routerLink="/admin/pedidos/novo"
        ><app-icon name="plus" />Novo pedido</a
      >
    </div>
    <section class="panel">
      <div class="toolbar">
        <label class="inline-label"
          >Data da entrega<input
            type="date"
            [formControl]="date"
            (change)="load()"
        /></label>
        <div class="search-field">
          <app-icon name="search" /><input
            aria-label="Pesquisar pedidos por estabelecimento"
            placeholder="Buscar estabelecimento"
            [formControl]="search"
          />
        </div>
        <select aria-label="Filtrar pedidos" [formControl]="filter">
          <option value="all">Todos os pedidos</option>
          <option value="unassigned">Sem rota</option>
          <option value="assigned">Com rota</option>
          <option value="cancelled">Cancelados</option>
        </select>
      </div>
      @if (error()) {
        <p class="error" role="alert">
          {{ error() }}
          <button class="text-button" (click)="load()">Tentar novamente</button>
        </p>
      }
      @if (busy()) {
        <div class="skeleton list-skeleton"></div>
      } @else if (!filtered().length && !error()) {
        <app-empty
          title="Espaço para o próximo pedido"
          message="Selecione uma data ou cadastre um pedido para começar a organizar suas entregas."
        />
      }
      @for (o of filtered().slice(page() * 25, page() * 25 + 25); track o.id) {
        <article class="record-row">
          <span class="record-icon peach"><app-icon name="box" /></span>
          <a class="record-info" [routerLink]="['/admin/pedidos', o.id]">
            <strong>{{ o.establishments?.name }}</strong
            ><small
              >{{ o.order_items?.length }} produtos ·
              {{ o.delivery_date | date: "dd/MM/yyyy" : "UTC" }}</small
            >
          </a>
          <span class="badge" [class.released]="!!o.route_stops?.length">{{
            o.status === "cancelled"
              ? "Cancelado"
              : o.route_stops?.length
                ? "Com rota"
                : "Aguardando rota"
          }}</span
          ><strong>{{ o.total | currency: "BRL" }}</strong
          ><div class="row-actions"><button class="text-button" type="button" [attr.aria-label]="'Excluir pedido de ' + o.establishments?.name" [disabled]="!!deleting()" (click)="remove(o)">Excluir</button></div>
        </article>
      }
      <div class="pagination">
        <button
          class="button secondary"
          [disabled]="!page()"
          (click)="page.set(page() - 1)"
        >
          Anterior</button
        ><span>{{ filtered().length }} pedidos · Página {{ page() + 1 }}</span
        ><button
          class="button secondary"
          [disabled]="(page() + 1) * 25 >= filtered().length"
          (click)="page.set(page() + 1)"
        >
          Próxima
        </button>
      </div>
    </section>
  `,
})
export class Orders {
  private data = inject(Data);
  private fb = inject(FormBuilder);
  private feedback = inject(Feedback);
  readonly deleting = signal<string | null>(null);
  readonly date = this.fb.nonNullable.control(today());
  readonly search = this.fb.nonNullable.control("");
  readonly filter = this.fb.nonNullable.control("all");
  readonly rows = signal<Order[]>([]);
  readonly busy = signal(true);
  readonly error = signal("");
  readonly page = signal(0);
  private request = 0;
  constructor() {
    void this.load();
    this.search.valueChanges.subscribe(() => this.page.set(0));
    this.filter.valueChanges.subscribe(() => this.page.set(0));
  }
  filtered() {
    return this.rows().filter(
      (o) =>
        (o.establishments?.name || "")
          .toLowerCase()
          .includes(this.search.value.toLowerCase()) &&
        (this.filter.value === "all" ||
          (this.filter.value === "unassigned" &&
            o.status === "open" &&
            !o.route_stops?.length) ||
          (this.filter.value === "assigned" && !!o.route_stops?.length) ||
          (this.filter.value === "cancelled" && o.status === "cancelled")),
    );
  }
  async remove(order: Order) {
    if (this.deleting()) return;
    if (!(await this.feedback.confirm("Excluir pedido?", "O pedido e seus itens serão excluídos. Se estiver em uma rota em rascunho, será removido dela. Esta ação não pode ser desfeita.", "Excluir pedido"))) return;
    this.deleting.set(order.id);
    this.error.set("");
    try {
      await this.data.api("orders", { id: order.id, expected_updated_at: order.updated_at, expected_route_id: order.route_stops?.[0]?.route_id || null }, "PATCH");
      await this.load();
      this.feedback.toast("Pedido excluído.");
    } catch (e) { this.error.set((e as Error).message); }
    finally { this.deleting.set(null); }
  }
  async load() {
    if (!this.date.value) return;
    const request = ++this.request;
    this.page.set(0);
    this.busy.set(true);
    this.error.set("");
    try {
      const rows = await this.data.orders(this.date.value);
      if (request === this.request) this.rows.set(rows);
    } catch (e) {
      if (request === this.request) this.error.set((e as Error).message);
    } finally {
      if (request === this.request) this.busy.set(false);
    }
  }
}
