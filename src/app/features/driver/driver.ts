import { Component, DestroyRef, HostListener, inject, signal, viewChild } from "@angular/core";
import { DatePipe, CurrencyPipe } from "@angular/common";
import { ReactiveFormsModule, FormBuilder } from "@angular/forms";
import { ActivatedRoute, Router } from '@angular/router';
import { Auth } from "../../core/auth";
import { Data } from "../../core/data";
import { Icon } from "../../shared/icon";
import { Dialog } from "../../shared/dialog";
import { Empty } from "../../shared/empty";
import { Account } from "../account/account";
import { RouteWorkspace } from "../maps/route-workspace";
import { OperationWorkspace } from '../operations/operation-workspace';
import {OperationsData} from '../../core/operations/operations-data';
import {Feedback} from '../../core/feedback';
import {hasPendingOffline,readOffline,saveOffline} from '../../core/offline-storage';
import {journeyLabels, stopLabels, loadDifference, type OperationContext} from '../../../../shared/operations';
import { navigationUrl } from "../../../../shared/maps";
import {
  today,
  type DeliveryRoute,
  type Order,
} from "../../../../shared/models";
@Component({
  selector: "app-driver",
  imports: [
    DatePipe,
    CurrencyPipe,
    ReactiveFormsModule,
    Icon,
    Empty,
    Account,
    Dialog,
    RouteWorkspace,
    OperationWorkspace,
  ],
  templateUrl: "./driver.html",
  styleUrl: "./driver.scss",
})
export class Driver {
  readonly operationRoute=signal('');
  readonly journeyLabels=journeyLabels;
  readonly stopLabels=stopLabels;
  readonly mapRoute = signal("");
  readonly navigate = navigationUrl;
  readonly auth = inject(Auth);
  private data = inject(Data);
  private operations = inject(OperationsData);
  private feedback = inject(Feedback);
  private destroy = inject(DestroyRef);
  private workspace = viewChild(OperationWorkspace);
  private fb = inject(FormBuilder);
  readonly routes = signal<DeliveryRoute[]>([]);
  readonly busy = signal(true);
  readonly error = signal("");
  readonly detail = signal<Order | null>(null);
  readonly tab = signal<'home'|'product'|'establishment'|'routes'|'account'|'map'>('home');
  private router=inject(Router);
  private activated=inject(ActivatedRoute);
  readonly menuOpen=signal(false);
  readonly mobileMenu=window.matchMedia('(max-width: 760px), (max-height: 500px) and (pointer: coarse)');
  readonly mobile=signal(this.mobileMenu.matches);
  readonly menuGroup=signal(true);
  readonly collapsed=signal(this.readCollapsed());
  readonly contexts=signal<Record<string,OperationContext>>({});
  private summaryRequest=0;
  private oldOverflow='';
  readonly date = this.fb.nonNullable.control(today());
  private request = 0;
  constructor() {
    const subscription=this.activated.queryParamMap.subscribe(params=>{const tab=params.get('secao');if(tab && ['home','product','establishment','routes','account','map'].includes(tab)){this.tab.set(tab as typeof this.tab extends () => infer T ? T : never);this.openSection();}});
    this.destroy.onDestroy(()=>subscription.unsubscribe());
    void this.load();
    const stop=this.operations.watch(()=>void this.loadSummaries());
    const resize=(e:MediaQueryListEvent)=>{this.mobile.set(e.matches);if(!e.matches)this.closeMenu();};
    this.mobileMenu.addEventListener('change',resize);
    this.destroy.onDestroy(()=>{stop();this.mobileMenu.removeEventListener('change',resize);this.closeMenu();});
  }
  private readCollapsed(){try{return localStorage.getItem('entregala.driver.collapsed')==='true';}catch{return false;}}
  toggleCollapsed(){this.collapsed.update(v=>!v);try{localStorage.setItem('entregala.driver.collapsed',String(this.collapsed()));}catch{}}
  openMenu(){this.oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';this.menuOpen.set(true);setTimeout(()=>document.querySelector<HTMLElement>('.driver-menu-close')?.focus());}
  closeMenu(){if(!this.menuOpen())return;this.menuOpen.set(false);document.body.style.overflow=this.oldOverflow;document.querySelector<HTMLElement>('.driver-menu-open')?.focus();}
  @HostListener('document:keydown',['$event']) onKey(event:KeyboardEvent){
    if(!this.menuOpen())return;
    if(event.key==='Escape'){event.preventDefault();this.closeMenu();return;}
    if(event.key!=='Tab')return;
    const items=[...document.querySelectorAll<HTMLElement>('.driver-sidebar button:not(:disabled)')].filter(e=>e.offsetParent!==null);
    if(!items.length){event.preventDefault();return;}
    if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items[items.length-1].focus();}
    else if(!event.shiftKey&&document.activeElement===items[items.length-1]){event.preventDefault();items[0].focus();}
  }
  async navigateTo(tab:'home'|'product'|'establishment'|'routes'|'account'|'map'){
    const w=this.workspace();
    if(w?.store.busy()){this.feedback.toast('Aguarde a conclusão do registro.');return;}
    if(w && (w.editing()||w.dialog()||w.finalReason())) {
      if(!(await this.feedback.confirm('Descartar alterações?', 'O registro aberto ainda não foi salvo.', 'Descartar')))return;
      w.editing.set(null); w.dialog.set(null); w.finalReason.set(false);
    }
    this.closeMenu();this.tab.set(tab);void this.router.navigate([], {relativeTo:this.activated,queryParams:{secao:tab},queryParamsHandling:'merge'});
    if(tab==='product'||tab==='establishment'){
      const route=(tab==='establishment'?this.routes().find(r=>r.status==='in_progress'):undefined) || this.routes().find(r=>r.status==='loading'||r.status==='released') || this.routes()[0];
      if(route){this.mapRoute.set('');this.operationRoute.set(route.id);}
    }
    if(tab==='routes'){this.operationRoute.set('');this.mapRoute.set('');}
    if(tab==='map'){this.operationRoute.set('');this.mapRoute.set(this.routes().find(r=>r.status==='in_progress')?.id || this.routes()[0]?.id || '');}
  }
  navIndex(){return ({home:0,product:1,map:2,establishment:3,routes:3,account:4})[this.tab()];}
  private openSection(){const tab=this.tab();if(tab==='map'){this.operationRoute.set('');this.mapRoute.set(this.routes().find(r=>r.status==='in_progress')?.id||this.routes()[0]?.id||'');}else if(tab==='product'||tab==='establishment'){const route=(tab==='establishment'?this.routes().find(r=>r.status==='in_progress'):undefined)||this.routes().find(r=>r.status==='loading'||r.status==='released')||this.routes()[0];if(route){this.mapRoute.set('');this.operationRoute.set(route.id);}}else if(tab==='routes'){this.operationRoute.set('');this.mapRoute.set('');}}
  async loadSummaries(){
    const id=++this.summaryRequest, routes=this.routes();
    const entries=await Promise.all(routes.map(async r=>{try{const context=await this.operations.context(r.id);return context && Array.isArray(context.stops) ? [r.id,context] as const : null;}catch{return null;}}));
    if(id===this.summaryRequest)this.contexts.set(Object.fromEntries(entries.filter((x):x is NonNullable<typeof x>=>x!==null)));
  }
  loadSummary(){
    const contexts=this.routes().flatMap(r=>this.contexts()[r.id] ? [this.contexts()[r.id]] : []);
    const items=contexts.flatMap(c=>c.stops.flatMap(s=>s.items));
    const total=contexts.reduce((n,c)=>n+c.stops.reduce((sum,s)=>sum+(s.items.length||s.original_items.length),0),0);
    return {available:this.routes().every(r=>!!this.contexts()[r.id]),total,complete:items.filter(i=>i.loaded!==null&&!loadDifference(i)).length};
  }
  routeStats(route:DeliveryRoute){const stops=route.route_stops||[];return {establishments:new Set(stops.map(s=>s.orders?.establishment_id).filter(Boolean)).size,done:stops.filter(s=>['delivered','partial','not_delivered'].includes(s.status)).length};}
  delivered(){return this.routes().flatMap(r=>r.route_stops||[]).filter(s=>s.status==='delivered').length;}
  remaining(){return this.routes().flatMap(r=>r.route_stops||[]).filter(s=>s.status==='pending'||s.status==='in_service').length;}
  async load() {
    const request = ++this.request;
    this.busy.set(true);
    this.error.set("");
    try {
      await this.auth.refreshProfile();
      const [dated,active] = await Promise.all([this.data.routes(this.date.value),this.data.activeRoutes()]);
      const routes=[...new Map([...dated,...active].map(r=>[r.id,r])).values()];
      if (request === this.request) {this.routes.set([...routes].sort((a,b)=>Number(b.status==='in_progress')-Number(a.status==='in_progress')));if(!this.operationRoute()&&!this.mapRoute())this.openSection();const user=this.auth.session()?.user.id;if(user)void saveOffline(user,'routes:'+this.date.value,this.routes()).catch(()=>{});void this.loadSummaries();}
    } catch (e) {
      if (request === this.request) {
        const user=this.auth.session()?.user.id;
        const cached=!navigator.onLine&&user?await readOffline<DeliveryRoute[]>(user,'routes:'+this.date.value).catch(()=>null):null;
        this.routes.set(cached?.value||[]);
        if(cached&&!this.operationRoute()&&!this.mapRoute())this.openSection();
        this.error.set(cached ? 'Sem conexão. Exibindo dados salvos em '+new Date(cached.time).toLocaleString('pt-BR')+'.' : (e as Error).message);
        if(cached)void this.loadSummaries();
      }
    } finally {
      if (request === this.request) this.busy.set(false);
    }
  }
  stops(route: DeliveryRoute) {
    return [...(route.route_stops || [])].sort(
      (a, b) => a.position - b.position,
    );
  }
  count() {
    return this.routes().reduce((s, r) => s + (r.route_stops?.length || 0), 0);
  }
  async logout(){const user=this.auth.session()?.user.id;if(user&&await hasPendingOffline(user).catch(()=>true)){if(!await this.feedback.confirm('Sair e apagar alterações pendentes?','Há um registro salvo apenas neste aparelho. Ao sair ele será apagado.','Sair e apagar'))return;}try{await this.auth.logout();}catch{this.feedback.toast('Não foi possível limpar os dados deste aparelho. Tente novamente.');}}
  establishments() {
    return new Set(
      this.routes().flatMap((r) =>
        (r.route_stops || []).map((s) => s.orders?.establishment_id).filter(Boolean),
      ),
    ).size;
  }
  async show(order: Order) {
    this.detail.set(null);
    if(!navigator.onLine){this.detail.set(order);return;}
    try {
      this.detail.set(await this.data.order(order.id));
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
}
