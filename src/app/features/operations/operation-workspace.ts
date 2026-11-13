import {
  Component,
  input,
  output,
  inject,
  signal,
  computed,
  effect,
  DestroyRef,
} from "@angular/core";
import { DatePipe } from "@angular/common";
import { LoadIllustration } from "../../shared/operations/load-illustration";
import { OperationTime } from "../../shared/operations/operation-time";
import { OperationStore } from "../../core/operations/operations-data";
import { Auth } from "../../core/auth";
import { Feedback } from "../../core/feedback";
import { RouteProgress } from "../../shared/operations/route-progress";
import { LoadingChecklist } from "./loading-checklist";
import { DeliveryChecklist } from "./delivery-checklist";
import { ItemEditor } from "./item-editor";
import { OperationDialog } from "./operation-dialog";
import { RouteWorkspace } from "../maps/route-workspace";
import {
  journeyLabels,
  stopLabels,
  issueLabels,
  terminal,
  progress,
  loadingProgress,
  deliveryResult,
  type OperationalItem,
} from "../../../../shared/operations";
import { Dialog } from "../../shared/dialog";
@Component({
  selector: "app-operation-workspace",
  providers: [OperationStore],
  imports: [
    DatePipe,
    LoadIllustration,
    OperationTime,
    RouteProgress,
    LoadingChecklist,
    DeliveryChecklist,
    ItemEditor,
    OperationDialog,
    RouteWorkspace,
    Dialog,
  ],
  templateUrl: "./operation-workspace.html",
})
export class OperationWorkspace {
  readonly routeId = input.required<string>();
  readonly requestedSection = input<'default'|'product'|'establishment'|'delivery'>('default');
  readonly changed = output<void>();
  readonly store = inject(OperationStore);
  readonly auth = inject(Auth);
  private feedback = inject(Feedback);
  private destroy = inject(DestroyRef);
  readonly labels = journeyLabels;
  readonly stopLabels = stopLabels;
  readonly issueLabels = issueLabels;
  readonly historyLabels: Record<string, string> = {
    OP_BEGIN_LOADING: "Conferência iniciada",
    OP_LOAD_ITEM: "Carregamento conferido",
    OP_LOAD_GROUP: "Produto conferido na carga",
    OP_ADJUST_ITEM: "Mercadoria ajustada",
    OP_ADD_ITEM: "Item operacional incluído",
    OP_DELIVER_ITEM: "Quantidade entregue conferida",
    OP_START: "Jornada iniciada",
    OP_SERVE: "Atendimento iniciado",
    OP_ISSUE: "Ocorrência registrada",
    OP_FINISH_STOP: "Entrega finalizada",
    OP_REOPEN_STOP: "Correção administrativa autorizada",
    OP_FINISH: "Jornada encerrada",
  };
  issueTarget(stopId: string | null, itemId: string | null) {
    const s = this.store.context()?.stops.find((s) => s.id === stopId);
    const i = s?.items.find((i) => i.id === itemId);
    return s
      ? `Parada ${s.position} · ${s.establishment.name}${i ? " · " + i.name : ""}`
      : "Jornada";
  }
  readonly terminal = terminal;
  readonly view = signal<"summary" | "loading" | "delivery" | "map">("summary");
  readonly selected = signal("");
  readonly editing = signal<{
    item: OperationalItem;
    mode: "load" | "delivery" | "adjust";
  } | null>(null);
  readonly dialog = signal<"issue" | "add" | "reopen" | null>(null);
  readonly journeyIssue=signal(false);
  readonly stop = computed(
    () =>
      this.store.context()?.stops.find((s) => s.id === this.selected()) || null,
  );
  readonly p = computed(() => progress(this.store.context()?.stops || []));
  readonly loadStats = computed(() =>
    loadingProgress(this.store.context()?.stops.flatMap((s) => s.items) || []),
  );
  readonly next = computed(
    () => this.store.context()?.stops.find((s) => !terminal(s.status)) || null,
  );
  constructor() {
    effect(() => {
      this.store.open(this.routeId());
      this.selected.set("");
      this.view.set("summary");
    });
    this.destroy.onDestroy(() => this.store.close());
    effect(()=>{const section=this.requestedSection();if(section==='delivery'){this.view.set('delivery');if(!this.selected())this.selected.set(this.next()?.id||'');}else if(section!=='default')this.view.set('loading');});
  }
  async run(command: Record<string, unknown>) {
    if (await this.store.execute(command)) {
      this.editing.set(null);
      this.dialog.set(null);
      this.changed.emit();
      this.feedback.toast(this.store.queued() ? "Salvo no aparelho; aguardando sincronização." : "Registro salvo.");
      if (command["action"] === "finish") this.view.set("summary");
      if (command["action"] === "begin_loading") this.view.set("loading");
      if (
        command["action"] === "start" ||
        command["action"] === "finish_stop"
      ) {
        this.selected.set(this.next()?.id || "");
        this.view.set("delivery");
      }
      return true;
    }
    return false;
  }
  async discardPending(){if(await this.feedback.confirm('Descartar registro pendente?','A alteração salva apenas neste aparelho será perdida. Confira primeiro os dados atuais da rota.','Descartar'))await this.store.discardQueue();}
  async begin() {
    if (await this.run({ action: "begin_loading" })) this.view.set("loading");
  }
  async start() {
    const n = this.loadStats().differences;
    if (
      await this.feedback.confirm(
        "Iniciar entregas?",
        n
          ? `Existem ${n} itens com divergências de carregamento. Iniciar com essas pendências registradas?`
          : "A conferência física foi concluída. Confirme a saída para iniciar a jornada.",
        "Iniciar entregas",
      )
    )
      await this.run({ action: "start", acknowledge: true });
  }
  async finishStop() {
    const s = this.stop();
    if (!s) return;
    const result = deliveryResult(s.items);
    if (
      !(await this.feedback.confirm(
        "Finalizar entrega?",
        `${s.establishment.name}: ${stopLabels[result]}. As quantidades conferidas serão mantidas no histórico.`,
        "Finalizar entrega",
      ))
    )
      return;
    if (result !== "delivered") {
      this.finalReason.set(true);
      return;
    }
    await this.run({ action: "finish_stop", stop_id: s.id });
  }
  readonly finalReason = signal(false);
  readonly reason = signal("");
  async confirmDifference() {
    const s = this.stop();
    if (
      s &&
      (await this.run({
        action: "finish_stop",
        stop_id: s.id,
        reason: this.reason(),
      }))
    ) {
      this.finalReason.set(false);
      this.reason.set("");
    }
  }
  async finish() {
    if (
      await this.feedback.confirm(
        "Encerrar jornada?",
        `${this.p().full} integrais, ${this.p().partial} parciais e ${this.p().failed} não realizadas. Os dados ficarão disponíveis para consulta.`,
        "Finalizar jornada",
      )
    )
      await this.run({ action: "finish" });
  }
  show(id: string) {
    this.selected.set(id);
    this.view.set("delivery");
  }
  readonlyView() {
    return this.store.context()?.status === "completed";
  }
  driver() {
    return this.auth.profile()?.role === "driver";
  }
  async mapChanged() {
    await this.store.refresh();
    this.changed.emit();
  }
}
