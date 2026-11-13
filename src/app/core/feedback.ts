import { Injectable, signal } from "@angular/core";
@Injectable({ providedIn: "root" })
export class Feedback {
  readonly message = signal("");
  readonly confirmation = signal<{
    title: string;
    message: string;
    action: string;
  } | null>(null);
  private timer?: ReturnType<typeof setTimeout>;
  private resolve?: (yes: boolean) => void;
  toast(message: string) {
    this.message.set(message);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.message.set(""), 5000);
  }
  confirm(title: string, message: string, action = "Confirmar") {
    this.confirmation.set({ title, message, action });
    return new Promise<boolean>((resolve) => {
      this.resolve = resolve;
    });
  }
  answer(value: boolean) {
    this.confirmation.set(null);
    this.resolve?.(value);
    this.resolve = undefined;
  }
}
