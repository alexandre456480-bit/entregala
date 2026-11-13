import {
  Component,
  input,
  inject,
  signal,
  computed,
  DestroyRef,
} from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { OperationsData } from "../../core/operations/operations-data";
import { RouteProgress } from "../../shared/operations/route-progress";
import { OperationWorkspace } from "./operation-workspace";
import { today } from "../../../../shared/models";
import {
  journeyLabels,
  progress,
  type OperationContext,
} from "../../../../shared/operations";
@Component({
  selector: "app-operations-monitor",
  imports: [ReactiveFormsModule, RouterLink, RouteProgress, OperationWorkspace],
  template: `<section class="operations-monitor">
    <div class="section-heading">
      <div>
        <span class="eyebrow">ACOMPANHAMENTO DO DIA</span>
        <h2>Operação de entregas</h2>
      </div>
      @if (compact()) {
        <a class="text-button" routerLink="/admin/operacao"
          >Abrir acompanhamento ↗</a
        >
      } @else {
        <label
          >Data operacional<input
            type="date"
            [formControl]="date"
            (change)="selected.set(''); load()"
        /></label>
      }
    </div>
    <p class="operation-sync" role="status">
      {{
        stale()
          ? "⚠ Consulta desatualizada"
          : connected()
            ? "● Atualizações conectadas"
            : "↻ Recuperação automática a cada 20 segundos"
      }}
    </p>
    @if (error()) {
      <p class="error" role="alert">
        {{ error() }}
        <button class="text-button" (click)="load()">Tentar novamente</button>
      </p>
    }
    <div class="operation-kpis">
      <article>
        <strong>{{ totals().total }}</strong><span>Planejadas</span>
      </article>
      <article>
        <strong>{{ totals().full }}</strong><span>Integrais</span>
      </article>
      <article>
        <strong>{{ totals().partial }}</strong><span>Parciais</span>
      </article>
      <article>
        <strong>{{ totals().failed }}</strong><span>Não realizadas</span>
      </article>
      <article>
        <strong>{{ totals().remaining }}</strong><span>Pendentes</span>
      </article>
      <article [class.has-difference]="totals().issues > previousIssues">
        <strong>{{ totals().issues }}</strong><span>Ocorrências</span>
      </article>
    </div>
    <p class="muted">
      {{ stateCount("loading") }} em carregamento ·
      {{ stateCount("in_progress") }} em andamento ·
      {{ stateCount("completed") }} finalizadas
    </p>
    @if (!rows().length && !error()) {
      <p class="note">Nenhuma rota para esta data.</p>
    }
    <div class="operation-driver-grid">
      @for (r of rows(); track r.id) {
        <article class="operation-driver-card">
          <div class="section-heading">
            <strong>{{ r.driver_name }}</strong><span class="badge">{{
              labels[r.status]
            }}</span>
          </div>
          <app-route-progress [stops]="r.stops" />
          <p>{{ r.issues.length }} ocorrências registradas</p>
          <button
            class="button secondary full"
            (click)="selected.set(selected() === r.id ? '' : r.id)"
          >
            Consultar operação
          </button>
        </article>
      }
    </div>
    @if (selected()) {
      <app-operation-workspace [routeId]="selected()" (changed)="load()" />
    }
  </section>`,
})
export class OperationsMonitor {
  readonly compact = input(false);
  private api = inject(OperationsData);
  private destroy = inject(DestroyRef);
  readonly date = new FormControl(today(), { nonNullable: true });
  readonly rows = signal<OperationContext[]>([]);
  readonly selected = signal("");
  readonly error = signal("");
  readonly stale = signal(true);
  readonly connected = signal(false);
  readonly labels = journeyLabels;
  previousIssues = 0;
  private serial = 0;
  readonly totals = computed(() =>
    this.rows().reduce(
      (t, r) => {
        const p = progress(r.stops);
        return {
          total: t.total + p.total,
          full: t.full + p.full,
          partial: t.partial + p.partial,
          failed: t.failed + p.failed,
          remaining: t.remaining + p.remaining,
          issues: t.issues + r.issues.length,
        };
      },
      { total: 0, full: 0, partial: 0, failed: 0, remaining: 0, issues: 0 },
    ),
  );
  constructor() {
    void this.load();
    const stop = this.api.watch(
      () => void this.load(),
      undefined,
      (c) => {
        this.connected.set(c);
        if (!navigator.onLine) this.stale.set(true);
      },
    );
    this.destroy.onDestroy(() => {
      this.serial++;
      stop();
    });
  }
  stateCount(state: string) {
    return this.rows().filter((r) => r.status === state).length;
  }
  async load() {
    const serial = ++this.serial;
    try {
      const routes = await this.api.data.routes(this.date.value);
      const rows = await Promise.all(routes.map((r) => this.api.context(r.id)));
      if (serial !== this.serial) return;
      this.previousIssues = this.totals().issues;
      this.rows.set(rows);
      this.stale.set(false);
      this.error.set("");
    } catch (e) {
      if (serial === this.serial) {
        this.stale.set(true);
        this.error.set((e as Error).message);
      }
    }
  }
}
