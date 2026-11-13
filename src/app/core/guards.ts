import { inject } from "@angular/core";
import { Router, type CanActivateFn } from "@angular/router";
import { Auth } from "./auth";
export const roleGuard: CanActivateFn = async (route) => {
  const auth = inject(Auth),
    router = inject(Router);
  await auth.ready;
  if (!auth.session()) return router.parseUrl("/login");
  try {
    await auth.refreshProfile();
  } catch {
    return router.parseUrl("/login");
  }
  if (auth.recovering()) return router.parseUrl("/recuperar");
  const role = auth.profile()?.role;
  return (
    role === route.data["role"] ||
    router.parseUrl(role === "admin" ? "/admin" : "/motorista")
  );
};
