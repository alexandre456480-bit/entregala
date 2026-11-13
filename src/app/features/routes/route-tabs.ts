import {Component, input} from '@angular/core';
import {RouterLink} from '@angular/router';

@Component({
 selector:'app-route-tabs', imports:[RouterLink], styles:[`:host{display:block;margin-bottom:22px}.route-tabs{display:inline-flex;gap:4px;padding:4px;background:#e7efe5;border:1px solid #dbe7d9;border-radius:13px}.route-tabs a{padding:10px 18px;border-radius:10px;color:#637c6a;font-size:13px;font-weight:600}.route-tabs a[aria-current=page]{background:#fff;color:#086153;box-shadow:0 2px 7px #244d3114}`],
 template:`<nav class="route-tabs" aria-label="Rotas e mapa">
   <a routerLink="/admin/rotas" [queryParams]="params()" [attr.aria-current]="active()==='planning' ? 'page' : null">Planejamento</a>
   <a routerLink="/admin/mapa" [queryParams]="params()" [attr.aria-current]="active()==='map' ? 'page' : null">Mapa</a>
 </nav>`,
})
export class RouteTabs {
 readonly active=input.required<'planning'|'map'>();
 readonly date=input('');
 readonly route=input<string|null|undefined>('');
 params(){return {data:this.date() || null, rota:this.route() || null};}
}
