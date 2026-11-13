import { Injectable, inject, signal } from "@angular/core";
import { Data, unwrap } from "../data";
import type { OperationContext } from "../../../../shared/operations";
import { Auth } from '../auth';
import { addOffline, readOffline, removeOffline, saveOffline } from '../offline-storage';
@Injectable({ providedIn: "root" })
export class OperationsData {
  readonly data = inject(Data);
  private auth=inject(Auth);
  async context(id: string): Promise<OperationContext> {
    try {const context=unwrap(
      await this.data.db.rpc("operation_context", { target: id }),
    ) as OperationContext;
    const user=this.auth.session()?.user.id;if(user && this.auth.profile()?.role==='driver')void saveOffline(user,'context:'+id,context).catch(()=>{});
    return context;
    }catch(e){const user=this.auth.session()?.user.id;if(!navigator.onLine&&user&&this.auth.profile()?.role==='driver'){const saved=await readOffline<OperationContext>(user,'context:'+id).catch(()=>null);if(saved)return saved.value;}throw e;}
  }
  command(payload: Record<string, unknown>) {
    return this.data.api<number>("operations", payload);
  }
  watch(
    refresh: () => void,
    id?: string,
    status?: (connected: boolean) => void,
  ) {
    let closed = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const notify = () => {
      if (closed || document.hidden) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!closed) refresh();
      }, 200);
    };
    const channel = this.data.db
      .channel(`operations:${id || "admin"}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "route_signals",
          ...(id ? { filter: `route_id=eq.${id}` } : {}),
        },
        notify,
      )
      .subscribe((s) => {
        status?.(s === "SUBSCRIBED");
        if (s === "SUBSCRIBED") notify();
      });
    const interval = setInterval(notify, 20000);
    const offline = () => status?.(false);
    window.addEventListener("online", notify);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", notify);
    return () => {
      closed = true;
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("online", notify);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", notify);
      void this.data.db.removeChannel(channel);
    };
  }
}
@Injectable()
export class OperationStore {
  private api = inject(OperationsData);
  private auth=inject(Auth);
  readonly context = signal<OperationContext | null>(null);
  readonly busy = signal(false);
  readonly error = signal("");
  readonly stale = signal(true);
  readonly realtime = signal(false);
  readonly syncedAt = signal<Date | null>(null);
  readonly queued=signal(false);
  readonly syncing=signal(false);
  private target = "";
  private generation = 0;
  private refreshSerial = 0;
  private stop?: () => void;
  private pending: { key: string; payload: Record<string, unknown> } | null =
    null;
  open(id: string) {
    this.close();
    this.target = id;
    this.context.set(null);
    this.error.set("");
    void this.refresh();
    void this.loadQueue();
    this.stop = this.api.watch(
      () => {
        if (!this.busy()) {void this.syncQueue();if(!this.queued())void this.refresh();}
      },
      id,
      (c) => {
        this.realtime.set(c);
        if (!navigator.onLine) this.stale.set(true);
      },
    );
  }
  close() {
    this.generation++;
    this.stop?.();
    this.stop = undefined;
    this.pending = null;
  }
  async refresh(reset = false) {
    const gen = this.generation,
      serial = ++this.refreshSerial;
    if (reset && !this.queued()) this.pending = null;
    try {
      const c = await this.api.context(this.target);
      if (gen !== this.generation || serial !== this.refreshSerial) return;
      this.context.set(c);
      this.stale.set(!navigator.onLine);
      if(navigator.onLine)this.syncedAt.set(new Date());
      else {const user=this.auth.session()?.user.id;if(user){const cached=await readOffline<OperationContext>(user,'context:'+this.target).catch(()=>null);if(cached)this.syncedAt.set(new Date(cached.time));}}
      if (reset) this.error.set("");
    } catch (e) {
      if (gen === this.generation) {
        this.stale.set(true);
        this.error.set((e as Error).message);
      }
    }
  }
  async execute(command: Record<string, unknown>) {
    const c = this.context();
    if (!c || this.busy()) return false;
    if(this.queued()){this.error.set('Sincronize ou resolva o registro pendente antes de continuar nesta rota.');return false;}
    this.busy.set(true);
    this.error.set("");
    const key = JSON.stringify(command);
    if (!this.pending || this.pending.key !== key)
      this.pending = {
        key,
        payload: {
          ...command,
          route_id: c.id,
          expected_version: c.operation_version,
          request_id: crypto.randomUUID(),
        },
      };
    let durableUser:string|undefined;
    try {
      if(!navigator.onLine){
        if(this.auth.profile()?.role!=='driver'||!['load_item','uncheck_load','deliver_item','issue'].includes(String(command['action'])))throw new Error('Esta operação precisa de conexão com a internet.');
        const action=String(command['action']), item=c.stops.flatMap(s=>s.items).find(i=>i.id===command['item_id']);
        if(action!=='issue'&&!item)throw new Error('Item indisponível nos dados salvos.');
        if(action==='uncheck_load'&&(c.status!=='loading'||item?.loaded===null))throw new Error('Não é possível desfazer esta conferência.');
        if(action==='load_item'||action==='deliver_item'){
          const q=Number(command['quantity']), reason=String(command['reason']||'').trim();
          if(!Number.isFinite(q)||q<0||q>999999||Math.abs(q*1000-Math.round(q*1000))>1e-6)throw new Error('Informe uma quantidade válida com até três casas decimais.');
          if(action==='load_item'&&!['loading','in_progress'].includes(c.status)||action==='deliver_item'&&(c.status!=='in_progress'||item?.loaded==null||q>Number(item.loaded)))throw new Error('Operação indisponível para o estado salvo.');
          if(item && (q!==Number(item.requested)||c.status==='in_progress'&&action==='load_item'||action==='deliver_item'&&(!!item.adjusted_name||!!item.adjusted_unit))&&reason.length<3)throw new Error('Informe o motivo da diferença.');
          if(action==='load_item'&&item&&q>Number(item.requested)&&command['allow_excess']!==true)throw new Error('Confirme a quantidade excedente.');
        }
        if(action==='issue'&&(!['loading','in_progress'].includes(c.status)||(['quantity','substitution','other'].includes(String(command['category']))&&String(command['reason']||'').trim().length<3)))throw new Error('Confira a ocorrência e informe o motivo.');
        const user=this.auth.session()?.user.id;if(!user)throw new Error('Sessão indisponível.');
        await addOffline(user,'queue:'+c.id,this.pending.payload);
        this.queued.set(true);this.error.set('Registro salvo neste aparelho, aguardando sincronização. Ainda não foi confirmado pelo servidor.');
        this.pending=null;return true;
      }
      const user=this.auth.session()?.user.id;
      if(user&&this.auth.profile()?.role==='driver'&&['load_item','uncheck_load','deliver_item','issue'].includes(String(command['action']))){await addOffline(user,'queue:'+c.id,this.pending.payload);durableUser=user;this.queued.set(true);}
      await this.api.command(this.pending.payload);
      if(durableUser){await removeOffline(durableUser,'queue:'+c.id);this.queued.set(false);}
      this.pending = null;
      await this.refresh();
      return true;
    } catch (e) {
      if(durableUser){this.pending=null;this.queued.set(true);this.error.set('Registro pendente neste aparelho. Sincronize ou confira um possível conflito antes de continuar.');this.stale.set(true);return false;}
      if(this.pending && this.auth.profile()?.role==='driver' && ['load_item','uncheck_load','deliver_item','issue'].includes(String(command['action'])) && (e as Error).message.startsWith('Falha de conexão')){
        const user=this.auth.session()?.user.id;
        if(user)try{await addOffline(user,'queue:'+c.id,this.pending.payload);this.pending=null;this.queued.set(true);this.error.set('Resposta não recebida. Registro salvo neste aparelho e aguardando sincronização.');return true;}catch{}
      }
      this.error.set((e as Error).message);
      this.stale.set(true);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
  private async loadQueue(){const user=this.auth.session()?.user.id,target=this.target;if(!user)return;const saved=await readOffline(user,'queue:'+target,false).catch(()=>null);if(this.target!==target)return;this.queued.set(!!saved);if(this.queued())void this.syncQueue();}
  async syncQueue(){
    const user=this.auth.session()?.user.id, target=this.target;if(!user||!target||!navigator.onLine||this.syncing())return;
    const run=async()=>{const saved=await readOffline<Record<string,unknown>>(user,'queue:'+target,false);if(!saved){this.queued.set(false);return;}this.queued.set(true);this.syncing.set(true);try{await this.auth.refreshProfile();if(this.auth.profile()?.id!==user||this.auth.profile()?.role!=='driver')throw new Error('Sessão não autorizada.');await this.api.command(saved.value);await removeOffline(user,'queue:'+target);this.queued.set(false);this.error.set('');await this.refresh();}catch{this.stale.set(true);this.error.set('Não foi possível sincronizar. Confira a conexão ou atualize os dados para verificar um possível conflito. O registro permanece neste aparelho.');}finally{this.syncing.set(false);}};
    try{if(navigator.locks)await navigator.locks.request('entregala-sync:'+user+':'+target,{ifAvailable:true},async lock=>{if(lock)await run();});else await run();}catch{this.error.set('Armazenamento indisponível. O registro pendente não foi removido.');}
  }
  async discardQueue(){const user=this.auth.session()?.user.id;if(!user||!this.queued()||this.syncing())return;await removeOffline(user,'queue:'+this.target);this.queued.set(false);await this.refresh(true);}
}
