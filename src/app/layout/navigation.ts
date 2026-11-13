export interface NavItem { path: string; label: string; icon: string; matches?: string[] }
export interface NavGroup { id: 'operation' | 'records' | 'settings'; label: string; icon: string; items: NavItem[] }
export const overview: NavItem = {path:'/admin',label:'Visão geral',icon:'grid'};
export const account: NavItem = {path:'/admin/conta',label:'Minha conta',icon:'users'};
export const groups: NavGroup[] = [
  {id:'operation',label:'Operação',icon:'truck',items:[
    {path:'/admin/operacao',label:'Entregas',icon:'check'},
    {path:'/admin/pedidos',label:'Pedidos',icon:'box'},
    {path:'/admin/rotas',label:'Rotas e mapa',icon:'route',matches:['/admin/rotas','/admin/mapa']},
  ]},
  {id:'records',label:'Cadastros',icon:'shop',items:[
    {path:'/admin/estabelecimentos',label:'Estabelecimentos',icon:'shop'},
    {path:'/admin/produtos',label:'Produtos',icon:'box'},
    {path:'/admin/motoristas',label:'Motoristas',icon:'users'},
  ]},
  {id:'settings',label:'Configurações',icon:'settings',items:[
    {path:'/admin/base',label:'Base da operação',icon:'pin'},
  ]},
];
export const mobileItems = [overview,groups[0].items[1],groups[0].items[2],groups[0].items[0]];
export function itemActive(item:NavItem,url:string):boolean {
  const path=url.split(/[?#]/)[0];
  return (item.matches || [item.path]).some(p => p==='/admin' ? path===p : path===p || path.startsWith(p+'/'));
}
