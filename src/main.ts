import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import { provideZonelessChangeDetection, LOCALE_ID, isDevMode } from "@angular/core";
import { registerLocaleData } from "@angular/common";
import pt from "@angular/common/locales/pt";
import { App } from "./app/app";
import { provideServiceWorker } from "@angular/service-worker";
import { routes } from "./app/routes";
registerLocaleData(pt);
bootstrapApplication(App, {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' }),
    { provide: LOCALE_ID, useValue: "pt-BR" },
  ],
}).catch(() => {
  document.body.textContent = "Não foi possível iniciar. Atualize a página.";
});
