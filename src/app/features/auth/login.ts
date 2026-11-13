import { Component, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { Auth } from "../../core/auth";
import { Icon } from "../../shared/icon";
@Component({
  selector: "app-login",
  imports: [ReactiveFormsModule, Icon],
  templateUrl: "./login.html",
})
export class Login {
  readonly auth = inject(Auth);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  readonly mode = signal<"login" | "forgot" | "password">(
    this.router.url.startsWith("/recuperar") ? "password" : "login",
  );
  readonly busy = signal(false);
  readonly error = signal("");
  readonly success = signal("");
  readonly visible = signal(false);
  readonly form = this.fb.nonNullable.group({
    email: ["", [Validators.required, Validators.email]],
    password: ["", [Validators.required, Validators.minLength(12)]],
  });
  async submit() {
    this.error.set("");
    this.success.set("");
    const mode = this.mode();
    const control =
      mode === "password"
        ? this.form.controls.password
        : this.form.controls.email;
    if (
      control.invalid ||
      (mode === "login" && !this.form.controls.password.value)
    ) {
      this.form.markAllAsTouched();
      this.error.set(
        "Preencha os campos corretamente. A nova senha deve ter pelo menos 12 caracteres.",
      );
      return;
    }
    this.busy.set(true);
    try {
      const { email, password } = this.form.getRawValue();
      if (mode === "login") await this.auth.login(email, password);
      else if (mode === "forgot") {
        await this.auth.reset(email);
        this.success.set(
          "Se houver uma conta para este e-mail, você receberá um link de recuperação.",
        );
      } else {
        await this.auth.ready;
        if (!this.auth.session())
          throw new Error(
            "Abra o link de recuperação recebido por e-mail para criar sua nova senha.",
          );
        await this.auth.changePassword(password);
        await this.auth.logout();
        this.mode.set("login");
        this.success.set("Senha atualizada. Entre com sua nova senha.");
      }
    } catch (e) {
      this.error.set(
        e instanceof Error
          ? e.message
          : "Não foi possível entrar. Tente novamente.",
      );
    } finally {
      this.busy.set(false);
    }
  }
  switchMode(mode: "login" | "forgot") {
    this.mode.set(mode);
    this.error.set("");
    this.success.set("");
  }
}
