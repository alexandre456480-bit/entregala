import {
  Component,
  ElementRef,
  viewChild,
  afterNextRender,
  DestroyRef,
  inject,
  input,
  output,
  effect,
  signal,
} from "@angular/core";
import type { Map as LibreMap, Marker, GeoJSONSource } from "maplibre-gl";
import type * as GeoJSON from "geojson";
import {stopLabels} from '../../../../shared/operations';
import { environment } from "../../../environments/generated";
import {
  lngLat,
  type MapPoint,
  type RouteGeometry,
  type Coordinates,
} from "../../../../shared/maps";
@Component({
  selector: "app-route-map",
  template: `<div class="route-map-shell">
    <div #canvas class="route-map-canvas" aria-label="Mapa das entregas"></div>
    @if (!configured) {
      <div class="map-message" role="status">
        <strong>Mapa aguardando configuração</strong>
        <p>
          Adicione a chave pública Geoapify para visualizar as ruas. A lista e
          os dados salvos continuam disponíveis.
        </p>
      </div>
    } @else if (error()) {
      <div class="map-message" role="alert">
        <strong>Não foi possível carregar o mapa</strong>
        @if (localAddressRestricted()) {
        <p>O serviço de mapas recusou este endereço local. Abra a aplicação em localhost para usar a chave configurada.</p>
        <a class="button secondary" [href]="localhostUrl">Abrir em localhost</a>
        } @else {
        <p>
          Verifique a conexão ou as restrições da chave. A lista continua
          disponível.
        </p>
        }
        <button type="button" class="button secondary" (click)="start()">
          Tentar novamente
        </button>
      </div>
    } @else if (!ready()) {
      <div class="map-message">Carregando ruas e avenidas…</div>
    }
    <div class="map-caption">{{ caption() }}</div>
  </div>`,
})
export class RouteMap {
  readonly points = input<MapPoint[]>([]);
  readonly framePoints = input<MapPoint[] | null>(null);
  readonly selected = input("");
  readonly lines = input<
    { id: string; color: string; geometry: RouteGeometry }[]
  >([]);
  readonly editable = input(false);
  readonly caption = input(
    "Pontos confirmados · percursos somente quando calculados",
  );
  readonly selectedPoint = output<string>();
  readonly moved = output<Coordinates>();
  readonly ready = signal(false);
  readonly error = signal(false);
  readonly localAddressRestricted = signal(false);
  readonly localhostUrl = typeof window === 'undefined' ? '/' : `${window.location.protocol}//localhost${window.location.port ? ':' + window.location.port : ''}${window.location.pathname}${window.location.search}${window.location.hash}`;
  readonly configured = Boolean(environment.geoapifyMapsKey);
  private canvas = viewChild.required<ElementRef<HTMLElement>>("canvas");
  private destroy = inject(DestroyRef);
  private map?: LibreMap;
  private markers = new Map<string, Marker>();
  private markerSignatures = new Map<string, string>();
  private lineSignature = "";
  private previousLines?: { id: string; color: string; geometry: RouteGeometry }[];
  private observer?: ResizeObserver;
  private gone = false;
  private signature = "";
  private lastSelected = "";
  private updateVersion = 0;
  constructor() {
    afterNextRender(() => {
      void this.start();
    });
    effect(() => {
      const points = this.points(),
        selected = this.selected(),
        lines = this.lines(),
        editable = this.editable(),
        framePoints = this.framePoints();
      if (this.ready()) void this.update(points, selected, lines, editable, framePoints);
    });
    this.destroy.onDestroy(() => {
      this.gone = true;
      this.observer?.disconnect();
      for (const m of this.markers.values()) m.remove();
      this.markers.clear();
      this.map?.remove();
    });
  }
  async start() {
    if (!this.configured || this.gone) return;
    this.ready.set(false);
    this.updateVersion++;
    this.error.set(false);
    this.localAddressRestricted.set(false);
    this.observer?.disconnect();
    this.markers.forEach((m) => m.remove());
    this.markers.clear();
    this.markerSignatures.clear();
    this.lineSignature = "";
    this.previousLines = undefined;
    this.map?.remove();
    this.signature = "";
    try {
      const lib = await import("maplibre-gl");
      if (this.gone) return;
      lib.setWorkerUrl("/assets/maps/maplibre-gl-worker.mjs");
      const initial = this.framePoints() ?? this.points();
      const bounds = new lib.LngLatBounds();
      initial.forEach((p) => bounds.extend(lngLat(p)));
      const map = new lib.Map({
        container: this.canvas().nativeElement,
        style: `https://maps.geoapify.com/v1/styles/dark-matter/style.json?apiKey=${encodeURIComponent(environment.geoapifyMapsKey)}`,
        transformStyle: (_previous, next) => ({
          ...next,
          layers: next.layers.map(layer => {
            if (layer.type === 'background') return {...layer, paint: {...layer.paint, 'background-color': '#101A38'}};
            if (layer.type === 'fill' && layer.id === 'water') return {...layer, paint: {...layer.paint, 'fill-color': '#12384d'}};
            if (layer.type === 'fill' && layer.id === 'building') return {...layer, paint: {...layer.paint, 'fill-color': '#1d2c4b'}};
            if (layer.type === 'fill' && layer.id === 'landuse_residential') return {...layer, paint: {...layer.paint, 'fill-color': '#14213f'}};
            if (layer.type === 'line' && layer.id.startsWith('highway_')) return {...layer, paint: {...layer.paint, 'line-color': layer.id.includes('casing') ? '#263955' : '#4b5d7a'}};
            if (layer.type === 'symbol' && layer.id.startsWith('highway_name')) return {...layer, paint: {...layer.paint, 'text-color': '#b5c4d7', 'text-halo-color': '#101a38', 'text-halo-width': 1}};
            return layer;
          }),
        }),
        ...(initial.length ? {
          bounds,
          fitBoundsOptions: { padding: 48, maxZoom: 16, duration: 0 },
        } : { center: [0, 0] as [number, number], zoom: 1 }),
        attributionControl: { compact: true },
        maxZoom: 19,
      });
      this.map = map;
      map.addControl(
        new lib.NavigationControl({ showCompass: false }),
        "top-right",
      );
      map.on("error", (event) => {
        const error = event.error as Error & { status?: number };
        this.localAddressRestricted.set(typeof window !== 'undefined' && window.location.hostname === '127.0.0.1' && (error?.status === 401 || error?.status === 403));
        this.error.set(true);
      });
      map.on("load", () => {
        if (this.gone) return;
        this.error.set(false);
        this.localAddressRestricted.set(false);
        this.ready.set(true);
      });
      this.observer = new ResizeObserver(() => {
        map.resize();
        if (this.ready()) void this.update(
          this.points(), this.selected(), this.lines(), this.editable(), this.framePoints(),
        );
      });
      this.observer.observe(this.canvas().nativeElement);
    } catch {
      this.error.set(true);
    }
  }
  private async update(
    points: MapPoint[],
    selected: string,
    lines: { id: string; color: string; geometry: RouteGeometry }[],
    editable: boolean,
    framePoints: MapPoint[] | null,
  ) {
    const version = ++this.updateVersion;
    try {
      const lib = await import("maplibre-gl");
      const map = this.map;
      if (!map || this.gone || version !== this.updateVersion) return;
      const ids = new Set(points.map((p) => p.id));
      for (const [id, m] of this.markers) {
        if (!ids.has(id)) {
          m.remove();
          this.markers.delete(id);
          this.markerSignatures.delete(id);
        }
      }
      for (const p of points) {
        let marker = this.markers.get(p.id);
        if (!marker) {
          const button = document.createElement("button");
          button.type = "button";
          button.addEventListener("click", () => this.selectedPoint.emit(p.id));
          marker = new lib.Marker({ element: button, draggable: editable })
            .setLngLat(lngLat(p))
            .addTo(map);
          marker.on("dragend", () => {
            const c = marker!.getLngLat();
            this.moved.emit({ latitude: c.lat, longitude: c.lng });
          });
          this.markers.set(p.id, marker);
        }
        const markerSignature = JSON.stringify([p.latitude,p.longitude,p.origin,p.destination,p.number,p.label,p.status,p.confirmed,p.color,p.id===selected,editable]);
        if (this.markerSignatures.get(p.id) === markerSignature) continue;
        this.markerSignatures.set(p.id, markerSignature);
        marker.setLngLat(lngLat(p));
        marker.setDraggable(editable);
        const element = marker.getElement();
        element.className = `delivery-marker ${p.origin ? "origin-marker" : ""} ${p.destination ? "destination-marker" : ""} ${p.id === selected ? "is-selected" : ""} ${p.confirmed === false ? "unconfirmed-marker" : ""} ${p.status?'status-'+p.status:''}`;
        element.textContent = p.origin
          ? "⌂"
          : (p.number == null ? "•" : String(p.number).padStart(2, "0")) + ({delivered:'✓',partial:'◐',not_delivered:'×',in_service:'•',pending:''}[p.status||'pending']);
        element.title=p.status?`${p.label} · ${stopLabels[p.status]}`:p.label;
        element.style.setProperty("--marker-color", p.color || "#174b4a");
        element.setAttribute(
          "aria-label",
          `${p.origin ? "Origem" : `Parada ${p.number || ""}`}: ${p.label}${p.status?' · '+stopLabels[p.status]:''}`,
        );
        element.setAttribute("aria-pressed", String(p.id === selected));
      }
      const source = "delivery-trajectories";
      const data: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: lines.map((l) => ({
          type: "Feature",
          properties: { color: l.color },
          geometry: l.geometry as GeoJSON.Geometry,
        })),
      };
      const lineSignature = lines === this.previousLines ? this.lineSignature : JSON.stringify(lines);
      this.previousLines = lines;
      if (map.getSource(source)) {
        if (lineSignature !== this.lineSignature) (map.getSource(source) as GeoJSONSource).setData(data);
      }
      else {
        map.addSource(source, { type: "geojson", data });
        map.addLayer({
          id: "delivery-route-glow",
          source,
          type: "line",
          paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 10, 16, 15], "line-opacity": 0.18, "line-blur": 3 },
          layout: { "line-join": "round", "line-cap": "round" },
        });
        map.addLayer({
          id: "delivery-route-halo",
          source,
          type: "line",
          paint: {
            "line-color": "#08122c",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 16, 11],
            "line-opacity": 0.95,
          },
          layout: { "line-join": "round", "line-cap": "round" },
        });
        map.addLayer({
          id: "delivery-route-line",
          source,
          type: "line",
          paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 16, 6] },
          layout: { "line-join": "round", "line-cap": "round" },
        });
      }
      this.lineSignature = lineSignature;
      const framing = framePoints ?? points;
      const { clientWidth: width, clientHeight: height } = map.getContainer();
      const signature = framing
        .map((p) => `${p.id}:${p.latitude},${p.longitude}`)
        .sort()
        .join("|");
      if (signature !== this.signature && framing.length && width > 0 && height > 0) {
        this.signature = signature;
        const bounds = new lib.LngLatBounds();
        framing.forEach((p) => bounds.extend(lngLat(p)));
        const padding = Math.min(56, Math.round(Math.min(width, height) * 0.12));
        map.fitBounds(bounds, {
          padding: { top: padding, right: padding, bottom: padding + 20, left: padding },
          maxZoom: 16,
          duration: 0,
        });
      }
      if (selected && selected !== this.lastSelected) {
        this.lastSelected = selected;
        const p = points.find((p) => p.id === selected);
        if (p) {
          const screen = map.project(lngLat(p));
          const inset = 40;
          if (screen.x < inset || screen.y < inset || screen.x > width - inset || screen.y > height - inset)
          map.easeTo({
            center: lngLat(p),
            duration: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? 0
              : 300,
          });
        }
      }
    } catch {
      this.error.set(true);
    }
  }
}
