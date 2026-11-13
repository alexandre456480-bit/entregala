import type { Routes } from "@angular/router";
import { roleGuard } from "./core/guards";
export const routes: Routes = [
  {
    path: "login",
    loadComponent: () => import("./features/auth/login").then((m) => m.Login),
  },
  {
    path: "recuperar",
    loadComponent: () => import("./features/auth/login").then((m) => m.Login),
  },
  {
    path: "admin",
    data: { role: "admin" },
    canActivate: [roleGuard],
    loadComponent: () =>
      import("./layout/admin-shell").then((m) => m.AdminShell),
    children: [
      {path:'operacao',loadComponent:()=>import('./features/operations/operations-monitor').then(m=>m.OperationsMonitor)},
      {
        path: "mapa",
        canDeactivate: [(component: import('./features/maps/map-board').MapBoard) => component.canLeave()],
        loadComponent: () =>
          import("./features/maps/map-board").then((m) => m.MapBoard),
      },
      {
        path: "base",
        loadComponent: () =>
          import("./features/maps/base-settings").then((m) => m.BaseSettings),
      },
      {
        path: "",
        loadComponent: () =>
          import("./features/dashboard/dashboard").then((m) => m.Dashboard),
      },
      {
        path: "estabelecimentos",
        loadComponent: () =>
          import("./features/establishments/establishments").then(
            (m) => m.Establishments,
          ),
      },
      {
        path: "produtos",
        loadComponent: () =>
          import("./features/products/products").then((m) => m.Products),
      },
      {
        path: "pedidos",
        loadComponent: () =>
          import("./features/orders/orders").then((m) => m.Orders),
      },
      {
        path: "pedidos/novo",
        canDeactivate: [(component: import('./features/orders/order-editor').OrderEditor) => component.canLeave()],
        loadComponent: () =>
          import("./features/orders/order-editor").then((m) => m.OrderEditor),
      },
      {
        path: "pedidos/:id",
        canDeactivate: [(component: import('./features/orders/order-editor').OrderEditor) => component.canLeave()],
        loadComponent: () =>
          import("./features/orders/order-editor").then((m) => m.OrderEditor),
      },
      {
        path: "rotas",
        canDeactivate: [(component: import('./features/routes/planner').Planner) => component.canLeave()],
        loadComponent: () =>
          import("./features/routes/planner").then((m) => m.Planner),
      },
      {
        path: "motoristas",
        loadComponent: () =>
          import("./features/drivers/drivers").then((m) => m.Drivers),
      },
      {
        path: "conta",
        loadComponent: () =>
          import("./features/account/account").then((m) => m.Account),
      },
    ],
  },
  {
    path: "motorista",
    data: { role: "driver" },
    canActivate: [roleGuard],
    loadComponent: () =>
      import("./features/driver/driver").then((m) => m.Driver),
  },
  { path: "", pathMatch: "full", redirectTo: "login" },
  { path: "**", redirectTo: "login" },
];
