import { createClient } from "@supabase/supabase-js";
import { config } from "./config";
import { ApiError } from "./errors";
import type { Profile } from "../shared/models";
export async function authenticate(authorization?: string) {
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization || "");
  if (!match)
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "Entre na sua conta para continuar.",
    );
  const env = config();
  const client = createClient(env.url, env.key, {
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error,
  } = await client.auth.getUser(match[1]);
  if (error || !user)
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "Sua sessão expirou. Entre novamente.",
    );
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();
  if (profileError || !profile?.active)
    throw new ApiError(
      403,
      "INACTIVE",
      "Conta inativa ou ainda não provisionada. Fale com o administrador.",
    );
  return { client, profile };
}
export function requireAdmin(profile: Pick<Profile, "role" | "active">) {
  if (!profile.active || profile.role !== "admin")
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Esta operação é exclusiva do administrador.",
    );
}
export function adminClient() {
  const env = config();
  if (!env.secret)
    throw new ApiError(
      503,
      "CONFIG_REQUIRED",
      "O servidor precisa da chave administrativa do Supabase.",
    );
  return createClient(env.url, env.secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
