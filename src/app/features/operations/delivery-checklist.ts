import { Component, input, output } from "@angular/core";
import { navigationUrl } from "../../../../shared/maps";
import {
  stopLabels,
  terminal,
  deliveryResult,
  type OperationalItem,
  type OperationalStop,
} from "../../../../shared/operations";
@Component({
  selector: "app-delivery-checklist",
  template: `<section
    class="operation-delivery"
    aria-label="Checklist da entrega"
  >
    <span class="eyebrow"
      >PARADA {{ stop().position }} · {{ labels[stop().status] }}</span
    >
    <h2>{{ stop().establishment.name }}</h2>
    <p>{{ stop().establishment.full_address }}</p>
    <p>{{ stop().establishment.district }}</p>
    @if (stop().establishment.notes) {
      <p class="note">{{ stop().establishment.notes }}</p>
    }
    @if (stop().order.notes) {
      <p class="note">{{ stop().order.notes }}</p>
    }
    <a
      class="button secondary full"
      [href]="navigate(stop().establishment)"
      target="_blank"
      rel="noopener noreferrer"
      >Navegar até o estabelecimento ↗</a
    >
    <div class="section-heading">
      <h3>Produtos da entrega</h3>
      <span>{{ checked() }} / {{ stop().items.length }} conferidos</span>
    </div>
    @for (i of stop().items; track i.id) {
      <article class="operation-item delivery-check-item">
        <div>
          <strong>{{ i.adjusted_name || i.name }}</strong>
          <p>Solicitado: {{ i.requested }} {{ i.unit }}</p>
          <p>Carregado: {{ i.loaded }} {{ i.adjusted_unit || i.unit }}</p>
          <strong
            >Entregue:
            {{
              i.delivered === null
                ? "A conferir"
                : i.delivered + " " + (i.adjusted_unit || i.unit)
            }}</strong
          >
          @if (i.adjusted_name || i.adjusted_unit) {
            <small
              >Original: {{ i.name }} · {{ i.unit }}. Substituição
              registrada.</small
            >
          }
          @if (i.delivery_reason) {
            <small>{{ i.delivery_reason }}</small>
          }
        </div>
        @if (!terminal(stop().status) && editable()) {
          <div class="operation-item-actions">
            <button
              class="button primary"
              [disabled]="busy() || i.delivered !== null"
              (click)="edit.emit({ item: i, mode: 'delivery' })"
            >
              {{
                i.delivered === null ? "Conferir entrega" : "Conferido"
              }}</button><button
              class="text-button"
              [disabled]="busy()"
              (click)="edit.emit({ item: i, mode: 'adjust' })"
            >
              Corrigir carga / produto
            </button>
            @if (i.delivered !== null) {
              <button
                class="text-button"
                [disabled]="busy()"
                (click)="edit.emit({ item: i, mode: 'delivery' })"
              >
                Corrigir quantidade entregue
              </button>
            }
          </div>
        }
      </article>
    }
    @if (!terminal(stop().status) && editable()) {
      <div class="actions operation-actions">
        <button
          class="button secondary"
          [disabled]="busy()"
          (click)="issue.emit()"
        >
          Registrar problema</button
        ><button
          class="button secondary"
          [disabled]="busy()"
          (click)="additional.emit()"
        >
          Adicionar item operacional
        </button>
      </div>
      <button
        class="button primary full"
        [disabled]="busy() || checked() !== stop().items.length || !checked()"
        (click)="finish.emit()"
      >
        Finalizar entrega · {{ labels[result()] }}
      </button>
    } @else {
      <p class="note">
        {{ labels[stop().status] }} · Dados salvos para consulta.
      </p>
    }
  </section>`,
})
export class DeliveryChecklist {
  readonly stop = input.required<OperationalStop>();
  readonly busy = input(false);
  readonly editable = input(false);
  readonly edit = output<{
    item: OperationalItem;
    mode: "delivery" | "adjust";
  }>();
  readonly issue = output<void>();
  readonly additional = output<void>();
  readonly finish = output<void>();
  readonly labels = stopLabels;
  readonly terminal = terminal;
  readonly navigate = navigationUrl;
  checked() {
    return this.stop().items.filter((i) => i.delivered !== null).length;
  }
  result() {
    return deliveryResult(this.stop().items);
  }
}
