import { Component, inject, signal } from "@angular/core";
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators as V,
} from "@angular/forms";
import { CurrencyPipe } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Data } from "../../core/data";
import { Feedback } from "../../core/feedback";
import { Icon } from "../../shared/icon";
import {
  today,
  subtotal,
  type Establishment,
  type Product,
  type Order,
  type OrderItem,
  type ProductCategory,
  type MeasurementUnit,
} from "../../../../shared/models";
@Component({
  selector: "app-order-editor",
  imports: [ReactiveFormsModule, CurrencyPipe, RouterLink, Icon],
  templateUrl: "./order-editor.html",
})
export class OrderEditor {
  private data = inject(Data);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private feedback = inject(Feedback);
  readonly establishments = signal<Establishment[]>([]);
  readonly products = signal<Product[]>([]);
  readonly categories = signal<ProductCategory[]>([]);
  readonly units = signal<MeasurementUnit[]>([]);
  readonly productSearch = this.fb.nonNullable.control("");
  readonly order = signal<Order | null>(null);
  readonly busy = signal(true);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly loaded = signal(false);
  readonly locked = signal(false);
  readonly establishmentSearch = this.fb.nonNullable.control("");
  readonly routeId = this.route.snapshot.queryParamMap.get("rota");
  readonly form = this.fb.nonNullable.group({
    establishment_id: ["", V.required],
    delivery_date: [
      this.route.snapshot.queryParamMap.get("data") || today(),
      V.required,
    ],
    notes: ["", V.maxLength(2000)],
    status: ["open" as "open" | "cancelled", V.required],
    items: this.fb.array([this.newItem()]),
  });
  get items() {
    return this.form.controls.items;
  }
  canLeave() {
    if (!this.form.dirty) return true;
    if (this.saving()) { this.feedback.toast('Aguarde o salvamento do pedido.'); return false; }
    return this.feedback.confirm('Descartar alterações?', 'As alterações não salvas no pedido serão perdidas.', 'Descartar');
  }
  constructor() {
    void this.load();
  }
  newItem(item?: OrderItem) {
    return this.fb.group({
      product_id: [item?.product_id || (null as string | null)],
      name: [item?.name || "", [V.required, V.minLength(2), V.maxLength(160)]],
      quantity: [
        item?.quantity ?? 1,
        [
          V.required,
          V.min(0.001),
          V.max(999999),
          V.pattern(/^\d+(\.\d{1,3})?$/),
        ],
      ],
      unit: [item?.unit || this.units()[0]?.abbreviation || "", [V.required, V.maxLength(20)]],
      unit_price: [
        item?.unit_price ?? (null as number | null),
        [V.min(0), V.max(9999999), V.pattern(/^\d+(\.\d{1,2})?$/)],
      ],
      notes: [item?.notes || "", V.maxLength(1000)],
    });
  }
  filteredEstablishments() {
    const q = this.establishmentSearch.value.toLowerCase();
    return this.establishments().filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.district.toLowerCase().includes(q),
    );
  }
  selected() {
    return this.establishments().find(
      (e) => e.id === this.form.controls.establishment_id.value,
    );
  }
  productChanged(index: number) {
    const row = this.items.at(index),
      p = this.products().find(
        (p) => p.active && p.name === row.controls.name.value,
      );
    row.patchValue({
      product_id: p?.id || null,
    });
  }
  groupedProducts(){
    const q=this.productSearch.value.trim().toLocaleLowerCase('pt-BR');
    const compare=(a:string,b:string)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'});
    return [...this.categories()].sort((a,b)=>compare(a.name,b.name)).map(category=>({category,products:this.products().filter(p=>p.active&&p.category_id===category.id&&p.name.toLocaleLowerCase('pt-BR').includes(q)).sort((a,b)=>compare(a.name,b.name))})).filter(g=>!q||g.products.length);
  }
  hasUnit(value:string){return this.units().some(u=>u.abbreviation===value);}
  selectProduct(product:Product){
    if(this.locked()||(this.items.length>=100 && this.items.at(0).controls.name.value))return;
    let row=this.items.controls.find(i=>!i.controls.name.value);
    if(!row){row=this.newItem();this.items.push(row);}
    row.patchValue({product_id:product.id,name:product.name,unit:row.controls.unit.value||this.units()[0]?.abbreviation||''});
    this.form.markAsDirty();
    this.feedback.toast(product.name+' adicionado ao pedido.');
  }
  lineTotal(index: number) {
    const v = this.items.at(index).getRawValue();
    return subtotal({ quantity: Number(v.quantity), unit_price: v.unit_price });
  }
  total() {
    return (
      this.items.controls.reduce(
        (sum, _, i) => sum + Math.round(this.lineTotal(i) * 100),
        0,
      ) / 100
    );
  }
  async load() {
    this.error.set("");
    this.busy.set(true);
    try {
      const [est, products, categories, units] = await Promise.all([
        this.data.activeEstablishments(),
        this.data.products(),
        this.data.categories(),
        this.data.units(),
      ]);
      this.establishments.set(est);
      this.products.set(products);
      this.categories.set(categories); this.units.set(units);
      if(!this.items.at(0).controls.unit.value && units.length)this.items.at(0).controls.unit.setValue(units[0].abbreviation);
      const id = this.route.snapshot.paramMap.get("id");
      if (id) {
        const order = await this.data.order(id);
        this.order.set(order);
        if (
          order.establishments &&
          !est.some((e) => e.id === order.establishment_id)
        )
          this.establishments.update((e) => [order.establishments!, ...e]);
        this.form.patchValue(order);
        this.replaceItems(order.order_items || []);
        if (order.route_stops?.length) {
          const routes = await this.data.routes(order.delivery_date);
          this.locked.set(
            routes.some(
              (r) =>
                r.status !== "draft" &&
                r.route_stops?.some((s) => s.order_id === order.id),
            ),
          );
        }
      }
      this.loaded.set(true);
      if (this.locked()) this.form.disable();
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  async save(another = false) {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set(
        "Confira estabelecimento, data e itens. Quantidade: até 3 casas decimais; preço: até 2.",
      );
      return;
    }
    this.saving.set(true);
    this.error.set("");
    try {
      const value = this.form.getRawValue();
      const order = this.order();
      const id = await this.data.api<string>("orders", {
        ...value,
        id: order?.id || null,
        expected_updated_at: order?.updated_at || null,
        route_id: this.routeId,
        items: value.items.map((i) => ({
          ...i,
          name: i.name?.trim(),
          unit: i.unit?.trim(),
          notes: i.notes || "",
        })),
      });
      this.feedback.toast("Pedido salvo. Total conferido pelo servidor.");
      this.form.markAsPristine();
      if (another) {
        this.order.set(null);
        this.form.reset({
          establishment_id: "",
          delivery_date: value.delivery_date,
          notes: "",
          status: "open",
        });
        this.replaceItems([]);
        this.establishmentSearch.setValue("");
        await this.router.navigate(["/admin/pedidos/novo"], {
          queryParams: { rota: this.routeId, data: value.delivery_date },
          replaceUrl: true,
        });
        document.getElementById("est-search")?.focus();
      } else if (this.routeId) {
        await this.router.navigate(["/admin/rotas"], {
          queryParams: { data: value.delivery_date, rota: this.routeId },
        });
      } else {
        await this.router.navigate(["/admin/pedidos", id]);
        this.order.set(await this.data.order(id));
      }
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
  addItem() {
    if (this.items.length < 100) this.items.push(this.newItem());
  }
  private replaceItems(items: OrderItem[]) {
    while (this.items.length > 1) this.items.removeAt(this.items.length - 1);
    this.items.at(0).reset(this.newItem(items[0]).getRawValue());
    for (const item of items.slice(1)) this.items.push(this.newItem(item));
  }
}
