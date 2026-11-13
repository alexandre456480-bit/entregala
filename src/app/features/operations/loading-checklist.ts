import {
  Component,
  input,
  output,
  signal,
  computed,
  inject,
  effect,
} from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { Feedback } from "../../core/feedback";
import { LoadIllustration } from "../../shared/operations/load-illustration";
import {
  loadingProgress,
  productGroups,
  loadDifference,
  type OperationContext,
  type OperationalItem,
} from "../../../../shared/operations";
@Component({
  selector: "app-loading-checklist",
  imports: [ReactiveFormsModule, LoadIllustration],
  templateUrl: "./loading-checklist.html",
})
export class LoadingChecklist {
  readonly context = input.required<OperationContext>();
  readonly busy = input(false);
  readonly initialMode = input<'establishment'|'product'>('establishment');
  readonly command = output<Record<string, unknown>>();
  readonly edit = output<OperationalItem>();
  readonly mode = signal<"establishment" | "product">("establishment");
  readonly search = new FormControl("", { nonNullable: true });
  readonly filter = new FormControl("all", { nonNullable: true });
  private feedback = inject(Feedback);
  constructor(){effect(()=>this.mode.set(this.initialMode()));}
  readonly stats = computed(() =>
    loadingProgress(this.context().stops.flatMap((s) => s.items)),
  );
  readonly groups = computed(() => productGroups(this.context().stops));
  readonly difference = loadDifference;
  readonly complete = computed(()=>this.context().stops.flatMap(s=>s.items).filter(i=>i.loaded!==null&&!loadDifference(i)).length);
  readonly completionPercent = computed(()=>this.stats().total ? Math.round(this.complete()/this.stats().total*100) : 0);
  pending(i:OperationalItem){return Math.max(0,Number(i.requested)-Number(i.loaded||0));}
  completed(items:OperationalItem[]){return items.filter(i=>i.loaded!==null&&!loadDifference(i)).length;}
  establishmentName(i:OperationalItem){return this.context().stops.find(s=>s.id===i.stop_id)?.establishment.name || 'Estabelecimento';}
  toggle(i:OperationalItem){
    if(this.busy())return;
    this.command.emit(i.loaded===null ? {action:'load_item',item_id:i.id,quantity:+i.requested,reason:''} : {action:'uncheck_load',item_id:i.id});
  }
  match(
    i: OperationalItem,
    establishment = this.context().stops.find((s) => s.id === i.stop_id)
      ?.establishment.name || "",
  ) {
    const q = this.search.value.toLocaleLowerCase("pt-BR");
    return (
      (!q ||
        [establishment, i.name, i.adjusted_name]
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(q)) &&
      (this.filter.value === "all" ||
        (this.filter.value === "pending"
          ? i.loaded === null || loadDifference(i)
          : this.filter.value === "checked"
            ? i.loaded !== null && !loadDifference(i)
            : loadDifference(i)))
    );
  }
  visibleGroups() {
    return this.groups().filter((g) => g.items.some((i) => this.match(i)));
  }
  async group(ids: string[]) {
    if (!ids.length || this.busy()) return;
    if (
      await this.feedback.confirm(
        "Conferiu fisicamente este produto?",
        "As quantidades solicitadas serão registradas nos itens individuais relacionados, sem alterar o pedido.",
        "Confirmar produto",
      )
    )
      this.command.emit({
        action: "load_group",
        item_ids: ids,
        acknowledge: true,
      });
  }
  pendingIds(items: OperationalItem[]) {
    return items.filter((i) => i.loaded === null).map((i) => i.id);
  }
}
