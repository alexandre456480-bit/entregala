import {Component, DestroyRef, HostListener, inject, signal} from '@angular/core';
import {NavigationEnd, Router, RouterLink, RouterOutlet} from '@angular/router';
import {filter} from 'rxjs';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {Auth} from '../core/auth';
import {Icon} from '../shared/icon';
import {account, groups, itemActive, mobileItems, overview, type NavGroup, type NavItem} from './navigation';
@Component({selector:'app-admin-shell', imports:[RouterLink,RouterOutlet,Icon], templateUrl:'./admin-shell.html', styleUrl:'./admin-shell.scss'})
export class AdminShell {
 readonly auth=inject(Auth); private readonly router=inject(Router); private readonly destroy=inject(DestroyRef);
 readonly overview=overview; readonly account=account; readonly groups=groups; readonly mobileItems=mobileItems;
 readonly url=signal(this.router.url); readonly open=signal(false);
 readonly mobile=signal(window.matchMedia('(max-width: 760px), (max-height: 500px) and (pointer: coarse)').matches);
 readonly collapsed=signal(this.readCollapsed());
 readonly expanded=signal<NavGroup['id']|null>(this.activeGroup(this.router.url));
 private oldOverflow=''; private returnFocus:HTMLElement|null=null;
 readonly nowLabel=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'short',day:'2-digit',month:'short'}).format(new Date());
 constructor(){
  this.router.events.pipe(filter(e=>e instanceof NavigationEnd),takeUntilDestroyed(this.destroy)).subscribe(()=>{this.url.set(this.router.url);this.expanded.set(this.activeGroup(this.router.url));this.closeMenu();});
  const media=window.matchMedia('(max-width: 760px), (max-height: 500px) and (pointer: coarse)');
  const change=(e:MediaQueryListEvent)=>{this.mobile.set(e.matches);if(!e.matches)this.closeMenu();};
  media.addEventListener('change',change);this.destroy.onDestroy(()=>{media.removeEventListener('change',change);this.closeMenu();});
 }
 private readCollapsed(){try{return localStorage.getItem('entregala.sidebar.collapsed')==='true';}catch{return false;}}
 private activeGroup(url:string){return groups.find(g=>g.items.some(i=>itemActive(i,url)))?.id || null;}
 active(item:NavItem){return itemActive(item,this.url());}
 groupActive(group:NavGroup){return group.items.some(i=>this.active(i));}
 toggleGroup(group:NavGroup){if(this.collapsed()&&!this.mobile()){this.setCollapsed(false);this.expanded.set(group.id);return;}this.expanded.set(this.expanded()===group.id?null:group.id);}
 setCollapsed(value:boolean){this.collapsed.set(value);try{localStorage.setItem('entregala.sidebar.collapsed',String(value));}catch{}}
 openMenu(){if(!this.mobile())return;this.returnFocus=document.activeElement as HTMLElement|null;this.oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';this.open.set(true);setTimeout(()=>document.querySelector<HTMLElement>('.sidebar-close')?.focus());}
 closeMenu(){if(!this.open())return;this.open.set(false);document.body.style.overflow=this.oldOverflow;this.returnFocus?.focus();this.returnFocus=null;}
 @HostListener('document:keydown',['$event']) keyboard(event:KeyboardEvent){
  if(!this.open()||!this.mobile())return;
  if(event.key==='Escape'){event.preventDefault();this.closeMenu();return;}
  if(event.key!=='Tab')return;
  const items=[...document.querySelectorAll<HTMLElement>('.sidebar button:not(:disabled), .sidebar a[href]')].filter(el=>el.offsetParent!==null && !el.closest('[inert]'));
  const first=items[0],last=items[items.length-1];if(!first){event.preventDefault();return;}
  if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
 }
 initials(){return (this.auth.profile()?.name||'').split(' ').slice(0,2).map(s=>s[0]).join('');}
}
