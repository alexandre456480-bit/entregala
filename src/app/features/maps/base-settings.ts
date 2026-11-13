import { Component, inject, signal } from "@angular/core";
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators as V,
} from "@angular/forms";
import { MapsData } from "../../core/maps/maps-data";
import { Data } from "../../core/data";
import { Feedback } from "../../core/feedback";
import { LocationEditor } from "../establishments/location-editor/location-editor";
import type { Coordinates, OperationBase } from "../../../../shared/maps";
@Component({
  selector: "app-base-settings",
  imports: [ReactiveFormsModule, LocationEditor],
  template: `<div class="page-heading">
      <div>
        <span class="eyebrow">PONTO DE PARTIDA</span>
        <h1>Base da distribuidora<span class="greeting-dot">.</span></h1>
        <p>
          Uma origem confirmada para todos os trajetos. Sem retorno obrigatório
          à base.
        </p>
      </div>
    </div>
    @if (busy()) {
      <div class="skeleton list-skeleton"></div>
    } @else {
      <form [formGroup]="form" (ngSubmit)="save()" class="panel">
        <div class="form-grid">
          <label
            >Nome da base *<input
              formControlName="name"
              placeholder="Nome da sua distribuidora" /></label
          ><label
            >Endereço completo *<input
              formControlName="address"
              placeholder="Rua, número, bairro, cidade e estado"
          /></label>
        </div>
        <label>Observações<textarea formControlName="notes"></textarea></label>
        @if (loaded()) {
          <app-location-editor
            title="Localização da base" [required]="true"
            [address]="form.controls.address.value"
            [initial]="initial()"
            [status]="base() ? 'confirmed' : 'unconfigured'"
            (confirmedPoint)="point.set($event);$event&&error.set('')"
          />
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <div class="actions">
          <button class="button primary" [disabled]="saving()">
            {{ saving() ? "Salvando…" : "Salvar base confirmada" }}
          </button>
        </div>
      </form>
    }`,
})
export class BaseSettings {
  private maps = inject(MapsData);
  private data = inject(Data);
  private feedback = inject(Feedback);
  private fb = inject(FormBuilder);
  readonly base = signal<OperationBase | null>(null);
  readonly point = signal<Coordinates | null>(null);
  readonly busy = signal(true);
  readonly loaded = signal(false);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly form = this.fb.nonNullable.group({
    name: ["", [V.required, V.minLength(2), V.maxLength(160)]],
    address: ["", [V.required, V.minLength(5), V.maxLength(500)]],
    notes: ["", V.maxLength(2000)],
  });
  constructor() {
    void this.load();
  }
  initial() {
    const b = this.base();
    return b
      ? { latitude: Number(b.latitude), longitude: Number(b.longitude) }
      : null;
  }
  async load() {
    try {
      const b = await this.maps.origin();
      this.base.set(b);
      if (b) {
        this.form.patchValue(b);
        this.point.set(this.initial());
      }
      this.loaded.set(true);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  async save() {
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.point()) {
      this.error.set(
        "Preencha o nome/endereço e confirme a localização da base.",
      );
      return;
    }
    this.saving.set(true);
    this.error.set("");
    try {
      await this.data.api("maps/base", {
        ...this.form.getRawValue(),
        ...this.point(),
        expected_updated_at: this.base()?.updated_at || null,
      });
      this.base.set(await this.maps.origin());
      this.feedback.toast(
        "Base confirmada. Os cálculos anteriores serão revalidados antes de reutilizar.",
      );
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
