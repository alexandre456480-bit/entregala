import { Component, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { Data } from "../../core/data";
import { Feedback } from "../../core/feedback";
import { Empty } from "../../shared/empty";
import { Icon } from "../../shared/icon";
import { Dialog } from "../../shared/dialog";
import {
  today,
  type DeliveryRoute,
  type Profile,
} from "../../../../shared/models";
@Component({
  selector: "app-drivers",
  imports: [ReactiveFormsModule, RouterLink, Empty, Icon, Dialog],
  template: `
    <div class="page-heading">
      <div>
        <span class="eyebrow">QUEM FAZ A ENTREGA ACONTECER</span>
        <h1>Motoristas<span class="greeting-dot">.</span></h1>
        <p>A equipe certa para cada caminho.</p>
      </div>
      <button
        class="button primary"
        (click)="open.set(true); formError.set('')"
      >
        <app-icon name="plus" />Cadastrar motorista
      </button>
    </div>
    <section class="panel">
      @if (error()) {
        <p class="error" role="alert">
          {{ error() }}
          <button class="text-button" (click)="load()">Tentar novamente</button>
        </p>
      }
      @if (busy()) {
        <div class="skeleton list-skeleton"></div>
      } @else if (!rows().length && !error()) {
        <app-empty
          title="Sua equipe começa aqui"
          message="Cadastre o primeiro motorista para planejar e liberar suas entregas."
          icon="users"
        />
      }
      @for (d of rows(); track d.id) {
        <article class="record-row">
          <span class="avatar">{{ d.name.slice(0, 1) }}</span>
          <div class="record-info">
            <strong>{{ d.name }}</strong
            ><small>{{ d.email }}</small
            ><a class="text-button" routerLink="/admin/rotas"
              >{{ routeCount(d.id) }} rotas hoje · Consultar planejamento</a
            >
          </div>
          <span class="badge" [class.released]="d.active">{{
            d.active ? "Ativo" : "Inativo"
          }}</span
          ><button
            class="button secondary"
            [disabled]="changing() === d.id"
            (click)="toggle(d)"
          >
            {{ d.active ? "Desativar" : "Reativar" }}
          </button>
        </article>
      }
    </section>
    @if (open()) {
      <div class="modal-backdrop">
        <section
          class="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="driver-title"
        >
          <div class="modal-heading">
            <div>
              <span class="eyebrow">ACESSO PROTEGIDO</span>
              <h2 id="driver-title">Novo motorista</h2>
            </div>
            <button
              class="icon-button"
              aria-label="Fechar"
              [disabled]="saving()"
              (click)="open.set(false)"
            >
              <app-icon name="close" />
            </button>
          </div>
          <p class="muted">
            A conta terá acesso somente às rotas liberadas para este motorista.
            Compartilhe a senha inicial por um canal seguro.
          </p>
          <form [formGroup]="form" (ngSubmit)="save()">
            <label
              >Nome completo *<input
                formControlName="name"
                autocomplete="name" /></label
            ><label
              >E-mail de acesso *<input
                formControlName="email"
                type="email"
                autocomplete="off" /></label
            ><label
              >Senha inicial *<input
                formControlName="password"
                type="password"
                autocomplete="new-password"
                placeholder="Pelo menos 12 caracteres"
            /></label>
            <p class="muted">
              O motorista pode alterar a senha em Minha conta.
            </p>
            @if (formError()) {
              <p class="error" role="alert">{{ formError() }}</p>
            }
            <div class="actions">
              <button
                type="button"
                class="button secondary"
                [disabled]="saving()"
                (click)="open.set(false)"
              >
                Cancelar</button
              ><button class="button primary" [disabled]="saving()">
                {{ saving() ? "Provisionando…" : "Criar conta de motorista" }}
              </button>
            </div>
          </form>
        </section>
      </div>
    }
  `,
})
export class Drivers {
  private data = inject(Data);
  private feedback = inject(Feedback);
  private fb = inject(FormBuilder);
  readonly rows = signal<Profile[]>([]);
  readonly routes = signal<DeliveryRoute[]>([]);
  readonly busy = signal(true);
  readonly saving = signal(false);
  readonly changing = signal("");
  readonly open = signal(false);
  readonly error = signal("");
  readonly formError = signal("");
  readonly form = this.fb.nonNullable.group({
    name: [
      "",
      [Validators.required, Validators.minLength(2), Validators.maxLength(160)],
    ],
    email: [
      "",
      [Validators.required, Validators.email, Validators.maxLength(254)],
    ],
    password: [
      "",
      [
        Validators.required,
        Validators.minLength(12),
        Validators.maxLength(128),
      ],
    ],
  });
  constructor() {
    void this.load();
  }
  routeCount(id: string) {
    return this.routes().filter((r) => r.driver_id === id).length;
  }
  async load() {
    this.busy.set(true);
    this.error.set("");
    try {
      const [rows, routes] = await Promise.all([
        this.data.drivers(),
        this.data.routes(today()),
      ]);
      this.rows.set(rows);
      this.routes.set(routes);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  async save() {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.formError.set(
        "Informe nome, e-mail válido e senha com pelo menos 12 caracteres.",
      );
      return;
    }
    this.saving.set(true);
    try {
      await this.data.api("drivers", this.form.getRawValue());
      this.form.reset();
      this.open.set(false);
      this.feedback.toast("Motorista cadastrado com acesso próprio.");
      await this.load();
    } catch (e) {
      this.formError.set((e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
  async toggle(d: Profile) {
    if (
      !(await this.feedback.confirm(
        d.active ? "Desativar acesso?" : "Reativar acesso?",
        d.active
          ? `${d.name} perderá imediatamente o acesso aos dados, inclusive em sessões já abertas.`
          : `O acesso de ${d.name} será restaurado.`,
        d.active ? "Desativar" : "Reativar",
      ))
    )
      return;
    this.changing.set(d.id);
    try {
      await this.data.api("drivers", { id: d.id, active: !d.active }, "PATCH");
      await this.load();
      this.feedback.toast("Acesso atualizado.");
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.changing.set("");
    }
  }
}
