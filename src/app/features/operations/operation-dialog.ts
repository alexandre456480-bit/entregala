import { Component, input, output, inject } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Dialog } from "../../shared/dialog";
import { issueLabels } from "../../../../shared/operations";
@Component({
  selector: "app-operation-dialog",
  imports: [ReactiveFormsModule, Dialog],
  template: `<div class="modal-backdrop">
    <section
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="operation-dialog-title"
      (keydown.escape)="!busy() && closed.emit()"
    >
      <div class="modal-heading">
        <span class="eyebrow">REGISTRO OPERACIONAL</span
        ><button
          class="icon-button"
          aria-label="Fechar registro"
          [disabled]="busy()"
          (click)="closed.emit()"
        >
          ×
        </button>
      </div>
      <h2 id="operation-dialog-title">
        {{
          mode() === "add"
            ? "Adicionar mercadoria"
            : mode() === "reopen"
              ? "Correção administrativa"
              : "Registrar problema"
        }}
      </h2>
      <form [formGroup]="form" (ngSubmit)="save()">
        @if (mode() === "issue") {
          <label
            >Categoria<select formControlName="category">
              @for (c of categories; track c.key) {
                <option [value]="c.key">{{ c.label }}</option>
              }
            </select></label
          >
        }
        @if (mode() === "add") {
          <label
            >Mercadoria efetiva<input
              formControlName="name"
              maxlength="160" /></label
          ><label
            >Unidade<input
              formControlName="unit"
              maxlength="20"
              placeholder="kg, caixa…" /></label
          ><label
            >Quantidade fisicamente carregada<input
              formControlName="quantity"
              type="number"
              inputmode="decimal"
              min="0.001"
              step="0.001"
              max="999999"
          /></label>
          <p class="muted">
            Item adicional operacional. O pedido original e seus preços serão
            preservados.
          </p>
        }
        <label
          >Justificativa / observação<textarea
            formControlName="reason"
            rows="3"
            maxlength="1000"
          ></textarea>
        </label>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button class="button primary full" [disabled]="busy()">
          {{ busy() ? "Salvando…" : "Salvar registro" }}
        </button>
      </form>
    </section>
  </div>`,
})
export class OperationDialog {
  readonly mode = input<"issue" | "add" | "reopen">("issue");
  readonly phase = input("journey");
  readonly stopId = input("");
  readonly busy = input(false);
  readonly error = input("");
  readonly saved = output<Record<string, unknown>>();
  readonly closed = output<void>();
  readonly categories = Object.entries(issueLabels).map(([key, label]) => ({
    key,
    label,
  }));
  private fb = inject(FormBuilder);
  readonly form = this.fb.nonNullable.group({
    category: ["closed"],
    reason: ["", Validators.maxLength(1000)],
    name: [""],
    unit: [""],
    quantity: [1],
  });
  save() {
    if (this.busy()) return;
    const v = this.form.getRawValue();
    const stop = this.stopId() ? { stop_id: this.stopId() } : {};
    this.saved.emit(
      this.mode() === "add"
        ? {
            action: "add_item",
            ...stop,
            name: v.name.trim(),
            unit: v.unit.trim(),
            quantity: Number(v.quantity),
            reason: v.reason.trim(),
          }
        : this.mode() === "reopen"
          ? { action: "reopen_stop", ...stop, reason: v.reason.trim() }
          : {
              action: "issue",
              ...stop,
              phase: this.phase(),
              category: v.category,
              reason: v.reason.trim(),
            },
    );
  }
}
