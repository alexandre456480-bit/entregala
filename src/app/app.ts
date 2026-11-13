import { Component, inject, signal } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { SwUpdate } from '@angular/service-worker';
import { Feedback } from "./core/feedback";
import { Auth } from './core/auth';
import { hasPendingOffline } from './core/offline-storage';
import { Dialog } from "./shared/dialog";
@Component({
  selector: "app-root",
  imports: [RouterOutlet, Dialog],
  template: `
    <router-outlet />
    @if(updateReady()){<div class="toast" role="status">Uma atualização está disponível. <button type="button" (click)="update()">Atualizar</button><button type="button" aria-label="Fechar aviso de atualização" (click)="updateReady.set(false)">×</button></div>}
    @if (feedback.message()) {
      <div class="toast" role="status">
        {{ feedback.message()
        }}<button
          type="button"
          aria-label="Fechar aviso"
          (click)="feedback.message.set('')"
        >
          ×
        </button>
      </div>
    }
    @if (feedback.confirmation(); as c) {
      <div class="modal-backdrop" (click)="feedback.answer(false)">
        <section
          class="modal confirm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          (click)="$event.stopPropagation()"
          (keydown.escape)="feedback.answer(false)"
        >
          <h2 id="confirm-title">{{ c.title }}</h2>
          <p>{{ c.message }}</p>
          <div class="actions">
            <button
              type="button"
              class="button secondary"
              (click)="feedback.answer(false)"
            >
              Cancelar</button
            ><button
              type="button"
              class="button primary"
              autofocus
              (click)="feedback.answer(true)"
            >
              {{ c.action }}
            </button>
          </div>
        </section>
      </div>
    }
  `,
})
export class App {
  readonly feedback = inject(Feedback);
  private auth=inject(Auth);
  private sw=inject(SwUpdate);
  readonly updateReady=signal(false);
  constructor(){if(this.sw.isEnabled)this.sw.versionUpdates.subscribe(event=>{if(event.type==='VERSION_READY')this.updateReady.set(true);});}
  async update(){const user=this.auth.session()?.user.id;if(user&&await hasPendingOffline(user).catch(()=>true)){this.feedback.toast('Sincronize as alterações pendentes antes de atualizar.');return;}if(await this.feedback.confirm('Atualizar aplicativo?','Salve os formulários abertos antes de continuar.','Atualizar'))location.reload();}
}
