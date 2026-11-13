import {
  Component,
  input,
  output,
  signal,
  inject,
  effect,
} from "@angular/core";
import { ReactiveFormsModule, FormBuilder } from "@angular/forms";
import {parseCoordinatePair} from '../../../../../shared/coordinates';
import { Data } from "../../../core/data";
import { RouteMap } from "../../../shared/maps/route-map";
import type {
  Coordinates,
  GeocodeCandidate,
  MapPoint,
} from "../../../../../shared/maps";
@Component({
  selector: "app-location-editor",
  imports: [ReactiveFormsModule, RouteMap],
  template: `<section class="location-editor">
    <h3>{{title()}}</h3>
    <p class="muted">
      {{ address() || "Preencha o endereço para localizar." }}
    </p>
    <span
      class="badge"
      [class.released]="state() === 'Localização confirmada'"
      >{{ state() }}</span><button
      type="button"
      class="button secondary"
      [disabled]="
        busy() || address().length < 5 || state() === 'Localização confirmada'
      "
      (click)="locate()"
    >
      {{ busy() ? "Localizando…" : "Localizar no mapa" }}
    </button>
    @if (state() === "Localização confirmada") {
      <button
        type="button"
        class="text-button"
        (click)="
          state.set('Localização precisa de revisão'); confirmedPoint.emit(null)
        "
      >
        Revisar localização
      </button>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @for (c of candidates(); track $index) {
      <button type="button" class="geocode-candidate" (click)="choose(c)">
        <strong>{{ c.label }}</strong><small
          >Confiança: {{ (c.confidence * 100).toFixed(0) }}% · {{ c.precision }}
          {{
            c.approximate
              ? "· Resultado aproximado — confira e ajuste o ponto"
              : ""
          }}</small
        >
      </button>
    }
    @if (point()) {
      <app-route-map
        [points]="points()"
        [editable]="true"
        (moved)="move($event)"
        caption="Arraste o marcador para a entrada de recebimento."
      />
    }
    <details>
      <summary>Informar ou ajustar coordenadas manualmente</summary>
      <label>Coordenadas (latitude, longitude)<input
        type="text" placeholder="Ex.: -16.6267014, -49.2048448"
        [formControl]="coordinates" (input)="editCoordinates()" (change)="manual()"
      /></label>
      <p class="muted">Informe primeiro a latitude e depois a longitude. Separe com vírgula ou espaço; para usar vírgula decimal, separe os valores por espaço.</p>
      @if(manualError()){<p class="error" role="alert">{{manualError()}}</p>}
      <button type="button" class="button secondary" (click)="manual()">Aplicar coordenadas ao mapa</button>
    </details>
    @if (point() && !manualDirty() && state() !== "Localização confirmada") {
      <label class="checkbox-label"
        ><input type="checkbox" [formControl]="ack" />Conferi que este ponto
        corresponde ao endereço informado.</label
      ><button
        type="button"
        class="button primary"
        [disabled]="!ack.value"
        (click)="confirm()"
      >
        Confirmar localização
      </button>
    }
    <p class="muted">
      {{required()?'Confirme o ponto e depois salve a base para gravar.':'O estabelecimento pode ser salvo sem localização. Confirme o ponto e depois salve o cadastro para gravar.'}}
      Sugestões nunca são confirmadas automaticamente.
    </p>
  </section>`,
})
export class LocationEditor {
  readonly title=input('Localização da entrega');
  readonly required=input(false);
  readonly manualError=signal('');
  readonly manualDirty=signal(false);
  readonly address = input("");
  readonly initial = input<Coordinates | null>(null);
  readonly status = input("unconfigured");
  readonly confirmedPoint = output<Coordinates | null>();
  readonly point = signal<Coordinates | null>(null);
  readonly state = signal("Localização não configurada");
  readonly candidates = signal<GeocodeCandidate[]>([]);
  readonly busy = signal(false);
  readonly error = signal("");
  private data = inject(Data);
  private fb = inject(FormBuilder);
  readonly coordinates = this.fb.nonNullable.control('');
  readonly ack = this.fb.nonNullable.control(false);
  private lastAddress: string | undefined;
  private request = 0;
  constructor() {
    effect(() => {
      const address = this.address();
      if (this.lastAddress === undefined) {
        const p = this.initial();
        this.point.set(p);
        if (p) {
          this.coordinates.setValue(`${p.latitude}, ${p.longitude}`);
        }
        this.state.set(
          this.status() === "confirmed"
            ? "Localização confirmada"
            : p
              ? "Localização precisa de revisão"
              : "Localização não configurada",
        );
      } else if (this.lastAddress !== address) {
        this.request++;
        this.state.set("Localização precisa de revisão");
        this.ack.setValue(false);
        this.candidates.set([]);
        this.confirmedPoint.emit(null);
      }
      this.lastAddress = address;
    });
  }
  points(): MapPoint[] {
    const p = this.point();
    return p
      ? [
          {
            ...p,
            id: "location",
            label: "Localização da entrega",
            confirmed: this.state() === "Localização confirmada",
          },
        ]
      : [];
  }
  async locate() {
    if (this.candidates().length) {
      this.state.set("Localização sugerida");
      return;
    }
    const request = ++this.request;
    this.busy.set(true);
    this.error.set("");
    try {
      const results = await this.data.api<GeocodeCandidate[]>("maps/geocode", {
        address: this.address(),
      });
      if (request !== this.request) return;
      this.candidates.set(results);
      this.state.set(
        results.length ? "Localização sugerida" : "Localização não configurada",
      );
      if (!results.length)
        this.error.set(
          "Nenhum endereço encontrado. Revise o endereço ou informe o ponto manualmente.",
        );
    } catch (e) {
      if (request === this.request) this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  choose(c: GeocodeCandidate) {
    this.move(c);
    this.error.set(
      c.approximate
        ? "A localização é aproximada. Ajuste o marcador para o endereço correto antes de confirmar."
        : "",
    );
  }
  move(p: Coordinates) {
    this.manualDirty.set(false);
    this.manualError.set('');
    this.error.set('');
    this.point.set({
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
    });
    this.coordinates.setValue(`${p.latitude}, ${p.longitude}`);
    this.ack.setValue(false);
    this.state.set("Aguardando confirmação");
    this.confirmedPoint.emit(null);
  }
  manual() {
    const point = parseCoordinatePair(this.coordinates.value);
    if (point)
      this.move(point);
    else {
      this.manualDirty.set(true);
      this.confirmedPoint.emit(null);
      this.state.set("Localização não configurada");
      this.manualError.set('Coordenadas inválidas. Informe latitude entre −90 e 90 e longitude entre −180 e 180, nessa ordem. Exemplo: -16.6267, -49.2048.');
    }
  }
  editCoordinates(){this.request++;this.manualDirty.set(true);this.manualError.set('');this.ack.setValue(false);this.state.set('Localização precisa de revisão');this.confirmedPoint.emit(null);}
  confirm() {
    if (!this.ack.value || !this.point() || this.manualDirty()) return;
    this.state.set("Localização confirmada");
    this.confirmedPoint.emit(this.point());
  }
}
