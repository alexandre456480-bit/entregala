import { Injectable, signal, inject } from "@angular/core";
import { createClient, type Session } from "@supabase/supabase-js";
import { Router } from "@angular/router";
import { environment } from "../../environments/generated";
import type { Profile } from "../../../shared/models";
import { clearOffline, readOffline, saveOffline } from './offline-storage';

@Injectable({ providedIn: "root" })
export class Auth {
  readonly client = createClient(
    environment.supabaseUrl,
    environment.supabaseKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    },
  );
  readonly session = signal<Session | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly recovering = signal(false);
  private router = inject(Router);
  private generation = 0;
  private pendingProfile: Promise<void> | null = null;
  readonly ready: Promise<void>;
  constructor() {
    this.ready = this.initialize();
    this.client.auth.onAuthStateChange((event, session) => {
      const previous=this.session()?.user.id;
      if(previous && session && previous!==session.user.id)void clearOffline(previous).catch(()=>{});
      this.session.set(session);
      if (event === "PASSWORD_RECOVERY") {
        this.recovering.set(true);
        void this.router.navigateByUrl("/recuperar");
      }
      if (event === "SIGNED_OUT") {
        this.generation++;
        this.profile.set(null);
        void this.router.navigateByUrl("/login");
      }
      // Do not await SDK calls inside its auth callback (auth lock).
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")
        setTimeout(() => {
          void this.refreshProfile().catch(() => {});
        }, 0);
    });
  }
  private async initialize() {
    const { data } = await this.client.auth.getSession();
    this.session.set(data.session);
    if (data.session)
      await this.refreshProfile().catch(() => {
        this.profile.set(null);
      });
  }
  async refreshProfile() {
    if (this.pendingProfile) return this.pendingProfile;
    const session = this.session();
    if (!session) {
      this.profile.set(null);
      return;
    }
    const version = this.generation;
    const task = (async () => {
      const { data, error } = await this.client
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single<Profile>();
      if (
        version !== this.generation ||
        this.session()?.user.id !== session.user.id
      )
        return;
      if (error && !navigator.onLine && session.expires_at && session.expires_at*1000>Date.now()) {
        const cached=await readOffline<Profile>(session.user.id,'profile').catch(()=>null);
        if(cached?.value.active && cached.value.role==='driver'){this.profile.set(cached.value);return;}
      }
      if (error || !data?.active) {
        this.profile.set(null);
        throw new Error(
          "Conta inativa ou ainda não provisionada. Fale com o administrador.",
        );
      }
      this.profile.set(data);
      if(data.role==='driver')void saveOffline(session.user.id,'profile',data).catch(()=>{});
    })();
    this.pendingProfile = task;
    try {
      await task;
    } finally {
      if (this.pendingProfile === task) this.pendingProfile = null;
    }
  }
  async login(email: string, password: string) {
    await this.ready;
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error)
      throw new Error(
        "E-mail ou senha inválidos. Confira seus dados e tente novamente.",
      );
    this.session.set(data.session);
    try {
      await this.refreshProfile();
    } catch (e) {
      await this.client.auth.signOut();
      throw e;
    }
    if (!this.profile())
      throw new Error(
        "Não foi possível verificar seu perfil. Tente novamente.",
      );
    await this.router.navigateByUrl(
      this.profile()?.role === "admin" ? "/admin" : "/motorista",
    );
  }
  async logout() {
    const user=this.session()?.user.id;
    if(user)try{await clearOffline(user);}catch(e){if(this.profile()?.role==='driver')throw e;}
    this.generation++;
    this.profile.set(null);
    this.session.set(null);
    await this.client.auth.signOut({ scope: "local" });
    await this.router.navigateByUrl("/login");
  }
  async reset(email: string) {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/recuperar`,
    });
    if (error)
      throw new Error(
        "Não foi possível enviar o e-mail. Aguarde e tente novamente.",
      );
  }
  async changePassword(password: string) {
    const { error } = await this.client.auth.updateUser({ password });
    if (error)
      throw new Error(
        "Não foi possível alterar a senha. Solicite um novo link ou escolha outra senha.",
      );
    this.recovering.set(false);
  }
}
