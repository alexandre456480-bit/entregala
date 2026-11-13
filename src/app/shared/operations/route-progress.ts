import { Component, input, computed } from "@angular/core";
import { progress, type OperationalStop } from "../../../../shared/operations";
@Component({
  selector: "app-route-progress",
  template: `<div class="operation-progress" aria-label="Progresso da jornada">
    <div class="operation-progress-heading">
      <strong>{{ p().treated }} de {{ p().total }} paradas tratadas</strong
      ><span>{{ p().percent }}% integrais</span>
    </div>
    <div
      class="operation-progress-track"
      role="progressbar"
      aria-label="Entregas integrais"
      [attr.aria-valuenow]="p().percent"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <span [style.width.%]="p().percent"></span
      ><i [style.width.%]="p().total ? (100 * p().partial) / p().total : 0"></i
      ><b [style.width.%]="p().total ? (100 * p().failed) / p().total : 0"></b>
    </div>
    <div class="operation-progress-legend">
      <span>✓ {{ p().full }} integrais</span
      ><span>◐ {{ p().partial }} parciais</span
      ><span>× {{ p().failed }} não realizadas</span
      ><span>○ {{ p().remaining }} restantes</span>
    </div>
  </div>`,
})
export class RouteProgress {
  readonly stops = input<OperationalStop[]>([]);
  readonly p = computed(() => progress(this.stops()));
}
