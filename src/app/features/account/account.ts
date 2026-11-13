import { Component, inject, signal } from "@angular/core";
import { ReactiveFormsModule, FormBuilder, Validators } from "@angular/forms";
import { Auth } from "../../core/auth";
import { Feedback } from "../../core/feedback";
@Component({
  selector: "app-account",
  imports: [ReactiveFormsModule],
  template: `<div class="page-heading">
      <div>
        <span class="eyebrow">SEU ACESSO</span>
        <h1>Minha conta<span class="greeting-dot">.</span></h1>
        <p>Informações de acesso e segurança.</p>
      </div>
    </div>
    <section class="panel account-panel">
      <h2>{{ auth.profile()?.name }}</h2>
      <p>{{ auth.profile()?.email }}</p>
      <span class="badge released">{{
        auth.profile()?.role === "admin" ? "Administrador" : "Motorista"
      }}</span>
      <hr /><h3>Instalar no celular</h3><p>No Android, use “Instalar aplicativo” no menu do navegador. No iPhone, abra no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”.</p>
      <hr />
      <h3>Alterar senha</h3>
      <form [formGroup]="form" (ngSubmit)="save()">
        <label
          >Nova senha<input
            formControlName="password"
            type="password"
            autocomplete="new-password"
            placeholder="Pelo menos 12 caracteres" /></label
        ><label
          >Confirmar nova senha<input
            formControlName="confirm"
            type="password"
            autocomplete="new-password"
        /></label>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button class="button primary" [disabled]="busy()">
          {{ busy() ? "Atualizando…" : "Atualizar senha" }}
        </button>
      </form>
    </section>`,
})
export class Account {
  readonly auth = inject(Auth);
  private fb = inject(FormBuilder);
  private feedback = inject(Feedback);
  readonly busy = signal(false);
  readonly error = signal("");
  readonly form = this.fb.nonNullable.group({
    password: [
      "",
      [
        Validators.required,
        Validators.minLength(12),
        Validators.maxLength(128),
      ],
    ],
    confirm: ["", Validators.required],
  });
  async save() {
    this.error.set("");
    this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    if (this.form.invalid || v.password !== v.confirm) {
      this.error.set(
        "As senhas precisam ser iguais e ter entre 12 e 128 caracteres.",
      );
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.changePassword(v.password);
      this.form.reset();
      this.feedback.toast("Senha atualizada.");
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
