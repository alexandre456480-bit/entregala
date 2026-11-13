import { Component, inject, signal, DestroyRef } from "@angular/core";
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators as V,
} from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { debounceTime, distinctUntilChanged } from "rxjs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Data, unwrap } from "../../core/data";
import { Feedback } from "../../core/feedback";
import { Icon } from "../../shared/icon";
import { Empty } from "../../shared/empty";
import { Dialog } from "../../shared/dialog";
import type { Establishment } from "../../../../shared/models";
import { LocationEditor } from "./location-editor/location-editor";
import type { Coordinates } from "../../../../shared/maps";
@Component({
  selector: "app-establishments",
  imports: [ReactiveFormsModule, Icon, Empty, Dialog, LocationEditor],
  templateUrl: "./establishments.html",
})
export class Establishments {
  readonly geoPoint = signal<Coordinates | null>(null);
  location() {
    const row = this.editing();
    return row && row.latitude !== null && row.longitude !== null
      ? { latitude: Number(row.latitude), longitude: Number(row.longitude) }
      : null;
  }
  address() {
    const v = this.form.getRawValue();
    return [
      v.street,
      v.number,
      v.complement,
      v.district,
      v.city,
      v.state,
      v.postal_code,
    ]
      .filter(Boolean)
      .join(", ");
  }
  confirmPoint(point: Coordinates | null) {
    this.geoPoint.set(point);
    if (point) this.form.patchValue(point);
  }
  private data = inject(Data);
  private feedback = inject(Feedback);
  private fb = inject(FormBuilder);
  private destroy = inject(DestroyRef);
  readonly rows = signal<Establishment[]>([]);
  readonly count = signal(0);
  readonly page = signal(0);
  readonly busy = signal(false);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly formError = signal("");
  readonly editing = signal<Establishment | null | undefined>(undefined);
  readonly detail = signal<Establishment | null>(null);
  readonly search = this.fb.nonNullable.control("");
  readonly active = this.fb.nonNullable.control("all");
  private request = 0;
  readonly form = this.fb.group({
    name: ["", [V.minLength(2), V.maxLength(160)]],
    trade_name: ["", V.maxLength(160)],
    phone: ["", [V.pattern(/^[+()\d\s-]{8,24}$/)]],
    contact_name: ["", V.maxLength(160)],
    postal_code: ["", [V.pattern(/^\d{8}$/)]],
    street: ["", [V.minLength(2), V.maxLength(200)]],
    number: ["", [V.maxLength(20)]],
    complement: ["", V.maxLength(160)],
    district: ["", [V.minLength(2), V.maxLength(120)]],
    city: ["", [V.minLength(2), V.maxLength(120)]],
    state: [
      "",
      [
        V.pattern(
          /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/,
        ),
      ],
    ],
    latitude: [null as number | null, [V.min(-90), V.max(90)]],
    longitude: [null as number | null, [V.min(-180), V.max(180)]],
    notes: ["", V.maxLength(2000)],
    receiving_hours: ["", V.maxLength(200)],
    active: [true],
  });
  constructor() {
    this.search.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe(() => {
        this.page.set(0);
        void this.load();
      });
    this.active.valueChanges
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => {
        this.page.set(0);
        void this.load();
      });
    void this.load();
    if (inject(ActivatedRoute).snapshot.queryParamMap.has("novo"))
      this.open(null);
  }
  async load() {
    const request = ++this.request;
    this.busy.set(true);
    this.error.set("");
    try {
      const r = await this.data.establishments(
        this.search.value,
        this.active.value,
        this.page(),
      );
      if (request === this.request) {
        this.rows.set(r.rows);
        this.count.set(r.count);
      }
    } catch (e) {
      if (request === this.request) this.error.set((e as Error).message);
    } finally {
      if (request === this.request) this.busy.set(false);
    }
  }
  open(row: Establishment | null) {
    this.geoPoint.set(null);
    this.formError.set("");
    this.editing.set(row);
    this.form.reset({
      name: "",
      trade_name: "",
      phone: "",
      contact_name: "",
      postal_code: "",
      street: "",
      number: "",
      complement: "",
      district: "",
      city: "",
      state: "",
      latitude: null,
      longitude: null,
      notes: "",
      receiving_hours: "",
      active: true,
    });
    if (row) this.form.patchValue(row);
  }
  async save() {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.formError.set(
        "Confira os campos destacados. CEP: 8 dígitos, sem pontuação.",
      );
      return;
    }
    const value = this.form.getRawValue();
    if ((value.latitude === null) !== (value.longitude === null)) {
      this.formError.set(
        "Informe latitude e longitude juntas, ou deixe ambas vazias.",
      );
      return;
    }
    this.saving.set(true);
    this.formError.set("");
    try {
      const row = this.editing();
      const result = row
        ? await this.data.db
            .from("establishments")
            .update(value)
            .eq("id", row.id)
            .select("*")
            .single()
        : await this.data.db
            .from("establishments")
            .insert(value)
            .select("*")
            .single();
      const saved = unwrap(result) as Establishment;
      let locationError = "";
      if (this.geoPoint())
        try {
          await this.data.api("maps/location", {
            id: saved.id,
            ...this.geoPoint(),
            expected_updated_at: saved.updated_at,
          });
        } catch (e) {
          locationError = (e as Error).message;
        }
      this.editing.set(undefined);
      this.feedback.toast("Estabelecimento salvo.");
      await this.load();
      if (locationError)
        this.error.set(
          "Cadastro salvo. A localização ainda precisa ser confirmada: " +
            locationError,
        );
    } catch (e) {
      this.formError.set((e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
  async toggle(row: Establishment) {
    if (
      !(await this.feedback.confirm(
        row.active ? "Desativar estabelecimento?" : "Reativar estabelecimento?",
        `${row.name}. O histórico de pedidos será preservado.`,
        row.active ? "Desativar" : "Reativar",
      ))
    )
      return;
    try {
      unwrap(
        await this.data.db
          .from("establishments")
          .update({ active: !row.active })
          .eq("id", row.id)
          .select("id")
          .single(),
      );
      this.feedback.toast("Status atualizado.");
      await this.load();
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
  next(delta: number) {
    this.page.update((p) => p + delta);
    void this.load();
  }
}
