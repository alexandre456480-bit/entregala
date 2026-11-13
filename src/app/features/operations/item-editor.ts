import {
  Component,
  input,
  output,
  signal,
  effect,
  inject,
} from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Dialog } from "../../shared/dialog";
import type { OperationalItem } from "../../../../shared/operations";
@Component({
  selector: "app-operation-item-editor",
  imports: [ReactiveFormsModule, Dialog],
  template: `<div class="modal-backdrop">
    <section
      class="modal operation-item-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-edit-title"
      (keydown.escape)="!busy() && closed.emit()"
    >
      <div class="modal-heading">
        <span class="eyebrow">CONFERÊNCIA FÍSICA</span
        ><button
          class="icon-button"
          aria-label="Fechar ajuste"
          [disabled]="busy()"
          (click)="closed.emit()"
        >
          ×
        </button>
      </div>
      <h2 id="item-edit-title">{{ item().name }}</h2>
      <p>
        Solicitado: <strong>{{ item().requested }} {{ item().unit }}</strong> ·
        Carregado: {{ item().loaded ?? "Pendente" }}
      </p>
      <form [formGroup]="form" (ngSubmit)="save()">
        <label
          >Quantidade {{ mode() === "delivery" ? "entregue" : "carregada"
          }}<input
            type="number"
            inputmode="decimal"
            min="0"
            max="999999"
            step="0.001"
            formControlName="quantity"
        /></label>
        @if (mode() === "adjust") {
          <label
            >Produto efetivo (deixe vazio para manter o original)<input
              formControlName="name"
              maxlength="160" /></label
          ><label
            >Unidade efetiva (deixe vazio para manter a original)<input
              formControlName="unit"
              maxlength="20"
          /></label>
        }
        <label
          >Motivo ou observação<textarea
            formControlName="reason"
            maxlength="1000"
            rows="3"
          ></textarea>
        </label>
        @if (mode() !== "delivery") {
          <label class="operation-check"
            ><input type="checkbox" formControlName="allow_excess" />Confirmo a
            correção física se a quantidade superar a solicitada.</label
          >
        }
        <p class="muted">
          Diferenças, substituições e correções exigem motivo. Para entregar
          mais que o carregado, corrija primeiro a carga.
        </p>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button class="button primary full" [disabled]="busy() || form.invalid">
          {{ busy() ? "Salvando…" : "Salvar conferência" }}
        </button>
      </form>
    </section>
  </div>`,
})
export class ItemEditor {
  readonly item = input.required<OperationalItem>();
  readonly mode = input<"load" | "delivery" | "adjust">("load");
  readonly busy = input(false);
  readonly error = input("");
  readonly saved = output<Record<string, unknown>>();
  readonly closed = output<void>();
  private fb = inject(FormBuilder);
  readonly form = this.fb.nonNullable.group({
    quantity: [
      0,
      [Validators.required, Validators.min(0), Validators.max(999999)],
    ],
    reason: ["", Validators.maxLength(1000)],
    allow_excess: [false],
    name: ["", Validators.maxLength(160)],
    unit: ["", Validators.maxLength(20)],
  });
  constructor() {
    effect(() => {
      const i = this.item(),
        mode = this.mode();
      this.form.reset({
        quantity:
          mode === "delivery"
            ? Number(i.delivered ?? i.loaded ?? 0)
            : Number(i.loaded ?? i.requested),
        reason:
          mode === "delivery"
            ? i.delivery_reason || i.load_reason
            : i.load_reason,
        allow_excess: false,
        name: i.adjusted_name,
        unit: i.adjusted_unit,
      });
    });
  }
  save() {
    if (this.form.invalid || this.busy()) return;
    const v = this.form.getRawValue();
    this.saved.emit({
      action:
        this.mode() === "load"
          ? "load_item"
          : this.mode() === "delivery"
            ? "deliver_item"
            : "adjust_item",
      item_id: this.item().id,
      quantity: Number(v.quantity),
      reason: v.reason.trim(),
      ...(this.mode() !== "delivery" ? { allow_excess: v.allow_excess } : {}),
      ...(this.mode() === "adjust"
        ? { name: v.name.trim(), unit: v.unit.trim() }
        : {}),
    });
  }
}
