import { Component, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Data, unwrap } from "../../core/data";
import { Feedback } from "../../core/feedback";
import { Empty } from "../../shared/empty";
import { Icon } from "../../shared/icon";
import { Dialog } from "../../shared/dialog";
import type { Product, ProductCategory, MeasurementUnit } from "../../../../shared/models";
@Component({
  selector: "app-products",
  imports: [ReactiveFormsModule, Empty, Icon, Dialog],
  template: `
    <div class="page-heading">
      <div>
        <span class="eyebrow">CATÁLOGO REUTILIZÁVEL</span>
        <h1>Produtos<span class="greeting-dot">.</span></h1>
        <p>Os favoritos da sua operação, prontos para o próximo pedido.</p>
      </div>
      <button class="button primary" (click)="open(null)">
        <app-icon name="plus" />Novo produto
      </button>
    </div>
    <section class="panel">
      <div class="toolbar">
        <div class="search-field">
          <app-icon name="search" /><input
            aria-label="Pesquisar produto"
            placeholder="Buscar produto"
            [formControl]="search"
          />
        </div>
        <span class="muted">{{ rows().length }} produtos no catálogo</span>
      </div>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      @if (busy()) {
        <div class="skeleton list-skeleton"></div>
      } @else if (!rows().length && !error()) {
        <app-empty
          title="Seu catálogo começa aqui"
          message="Cadastre produtos frequentes. Nos pedidos, você também pode digitar produtos avulsos."
        />
      }
      @for (
        row of filtered().slice(page() * 25, page() * 25 + 25);
        track row.id
      ) {
        <div class="record-row">
          <span class="record-icon peach"><app-icon name="box" /></span>
          <div class="record-info">
            <strong>{{ row.name }}</strong
            ><small>{{ categoryName(row.category_id) }}</small>
          </div>
          <span class="badge" [class.released]="row.active">{{
            row.active ? "Ativo" : "Inativo"
          }}</span
          ><button
            class="icon-button"
            aria-label="Editar produto"
            (click)="open(row)"
          >
            <app-icon name="edit" /></button
          ><button class="text-button" (click)="toggle(row)">
            {{ row.active ? "Desativar" : "Reativar" }}
          </button>
        </div>
      }
      <div class="pagination">
        <button
          class="button secondary"
          [disabled]="!page()"
          (click)="page.set(page() - 1)"
        >
          Anterior</button
        ><span>Página {{ page() + 1 }}</span
        ><button
          class="button secondary"
          [disabled]="(page() + 1) * 25 >= filtered().length"
          (click)="page.set(page() + 1)"
        >
          Próxima
        </button>
      </div>
    </section>
    <section class="panel">
      <div class="section-heading"><div><h2>Unidades de medida</h2><p class="muted">Gerencie as unidades usadas nos pedidos.</p></div><button class="button secondary" (click)="openUnit(null)"><app-icon name="plus" />Nova unidade</button></div>
      @for(unit of units();track unit.id){<div class="record-row"><div class="record-info"><strong>{{unit.name}}</strong><small>{{unit.abbreviation}}</small></div><button class="text-button" (click)="openUnit(unit)">Editar</button><button class="text-button" (click)="removeUnit(unit)">Excluir</button></div>}
    </section>
    <section class="panel"><div class="section-heading"><div><h2>Categorias</h2><p class="muted">Compartilhadas entre os produtos.</p></div></div>@for(category of categories();track category.id){<div class="record-row"><div class="record-info"><strong>{{category.name}}</strong></div><button class="text-button" (click)="editCategory(category)">Editar</button><button class="text-button" (click)="removeCategory(category)">Excluir</button></div>}</section>
    @if(categoryEditing();as category){<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="category-title"><div class="modal-heading"><h2 id="category-title">Editar categoria</h2><button class="icon-button" aria-label="Fechar" (click)="categoryEditing.set(null)"><app-icon name="close" /></button></div><form (ngSubmit)="saveCategory()"><label>Nome *<input [formControl]="categoryField" /></label>@if(formError()){<p class="error" role="alert">{{formError()}}</p>}<div class="actions"><button type="button" class="button secondary" (click)="categoryEditing.set(null)">Cancelar</button><button class="button primary" [disabled]="saving()">Salvar categoria</button></div></form></section></div>}
    @if(unitEditing() !== undefined){<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="unit-title"><div class="modal-heading"><h2 id="unit-title">{{unitEditing() ? 'Editar unidade' : 'Nova unidade'}}</h2><button class="icon-button" aria-label="Fechar" (click)="unitEditing.set(undefined)"><app-icon name="close" /></button></div><form [formGroup]="unitForm" (ngSubmit)="saveUnit()"><label>Nome *<input formControlName="name" placeholder="Ex.: Quilograma" /></label><label>Abreviação *<input formControlName="abbreviation" placeholder="Ex.: kg" /></label>@if(formError()){<p class="error" role="alert">{{formError()}}</p>}<div class="actions"><button type="button" class="button secondary" (click)="unitEditing.set(undefined)">Cancelar</button><button class="button primary" [disabled]="saving()">Salvar unidade</button></div></form></section></div>}
    @if (editing() !== undefined) {
      <div class="modal-backdrop">
        <section
          class="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prod-title"
        >
          <div class="modal-heading">
            <h2 id="prod-title">
              {{ editing() ? "Editar produto" : "Novo produto" }}
            </h2>
            <button
              class="icon-button"
              aria-label="Fechar"
              [disabled]="saving()"
              (click)="editing.set(undefined)"
            >
              <app-icon name="close" />
            </button>
          </div>
          <form [formGroup]="form" (ngSubmit)="save()">
            <label>Nome *<input formControlName="name" /></label
            ><label>Categoria *<input formControlName="category" placeholder="Busque ou crie uma categoria" autocomplete="off" /></label>
            <div class="category-choices">@for(category of matchingCategories();track category.id){<button type="button" class="text-button" (click)="form.controls.category.setValue(category.name)">{{category.name}}</button>} @if(canCreateCategory()){<button type="button" class="text-button" (click)="createCategory()">+ Criar categoria “{{form.controls.category.value.trim()}}”</button>}</div>
            @if (formError()) {
              <p class="error" role="alert">{{ formError() }}</p>
            }
            <div class="actions">
              <button
                type="button"
                class="button secondary"
                [disabled]="saving()"
                (click)="editing.set(undefined)"
              >
                Cancelar</button
              ><button class="button primary" [disabled]="saving()">
                {{ saving() ? "Salvando…" : "Salvar produto" }}
              </button>
            </div>
          </form>
        </section>
      </div>
    }
  `,
})
export class Products {
  private data = inject(Data);
  private fb = inject(FormBuilder);
  private feedback = inject(Feedback);
  readonly rows = signal<Product[]>([]);
  readonly busy = signal(true);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly formError = signal("");
  readonly editing = signal<Product | null | undefined>(undefined);
  readonly page = signal(0);
  readonly search = this.fb.nonNullable.control("");
  readonly units = signal<MeasurementUnit[]>([]);
  readonly categories = signal<ProductCategory[]>([]);
  readonly categoryEditing = signal<ProductCategory|null>(null);
  readonly categoryField = this.fb.nonNullable.control('',[Validators.required,Validators.minLength(2),Validators.maxLength(100)]);
  readonly unitEditing = signal<MeasurementUnit | null | undefined>(undefined);
  readonly unitForm = this.fb.nonNullable.group({name:['',[Validators.required,Validators.maxLength(100)]],abbreviation:['',[Validators.required,Validators.maxLength(20)]]});
  readonly form = this.fb.nonNullable.group({
    name: [
      "",
      [Validators.required, Validators.minLength(2), Validators.maxLength(160)],
    ],
    category: ["", [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
  });
  constructor() {
    void this.load();
    this.search.valueChanges.subscribe(() => this.page.set(0));
  }
  filtered() {
    return this.rows().filter((p) =>
      p.name
        .toLocaleLowerCase("pt-BR")
        .includes(this.search.value.toLocaleLowerCase("pt-BR")),
    );
  }
  async load() {
    this.busy.set(true);
    try {
      const [rows,categories,units]=await Promise.all([this.data.products(),this.data.categories(),this.data.units()]);
      this.rows.set(rows); this.categories.set(categories); this.units.set(units); this.error.set('');
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  open(row: Product | null) {
    this.editing.set(row);
    this.form.reset({ name: row?.name || "", category: row ? this.categoryName(row.category_id) : "" });
    this.formError.set("");
  }
  async save() {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.formError.set("Informe nome e categoria válidos.");
      return;
    }
    this.saving.set(true);
    try {
      const row = this.editing();
      const fields = this.form.getRawValue();
      const category = this.categories().find(c=>this.normalize(c.name)===this.normalize(fields.category));
      if(!category){this.formError.set('Selecione uma categoria ou crie uma nova.');return;}
      const value = {name:fields.name.trim(),category_id:category.id};
      unwrap(
        row
          ? await this.data.db
              .from("products")
              .update(value)
              .eq("id", row.id)
              .select("id")
              .single()
          : await this.data.db
              .from("products")
              .insert(value)
              .select("id")
              .single(),
      );
      this.editing.set(undefined);
      this.feedback.toast("Produto salvo.");
      await this.load();
    } catch (e) {
      this.formError.set((e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
  normalize(value:string){return value.trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');}
  categoryName(id:string){return this.categories().find(c=>c.id===id)?.name || 'Sem categoria';}
  matchingCategories(){const q=this.normalize(this.form.controls.category.value);return q ? this.categories().filter(c=>this.normalize(c.name).includes(q)) : this.categories();}
  canCreateCategory(){const q=this.normalize(this.form.controls.category.value);return q.length>=2&&!this.categories().some(c=>this.normalize(c.name)===q);}
  async createCategory(){const name=this.form.controls.category.value.trim().replace(/\s+/g,' ');if(!this.canCreateCategory())return;this.saving.set(true);try{const category=unwrap(await this.data.db.from('product_categories').insert({name}).select('*').single()) as ProductCategory;this.categories.update(c=>[...c,category]);this.form.controls.category.setValue(category.name);}catch(e){this.formError.set((e as Error).message);this.categories.set(await this.data.categories());}finally{this.saving.set(false);}}
  editCategory(category:ProductCategory){this.categoryEditing.set(category);this.categoryField.setValue(category.name);this.formError.set('');}
  async saveCategory(){const category=this.categoryEditing(), name=this.categoryField.value.trim().replace(/\s+/g,' ');if(!category||name.length<2||name.length>100){this.formError.set('Informe um nome válido.');return;}if(this.categories().some(c=>c.id!==category.id&&this.normalize(c.name)===this.normalize(name))){this.formError.set('Esta categoria já existe.');return;}this.saving.set(true);try{unwrap(await this.data.db.from('product_categories').update({name}).eq('id',category.id).select('id').single());this.categoryEditing.set(null);await this.load();}catch(e){this.formError.set((e as Error).message);}finally{this.saving.set(false);}}
  async removeCategory(category:ProductCategory){if(!await this.feedback.confirm('Excluir categoria?',category.name+'. Categorias vinculadas a produtos não podem ser excluídas.','Excluir'))return;try{unwrap(await this.data.db.from('product_categories').delete().eq('id',category.id).select('id').single());await this.load();}catch(e){this.error.set((e as Error).message);}}
  openUnit(unit:MeasurementUnit|null){this.unitEditing.set(unit);this.unitForm.reset({name:unit?.name||'',abbreviation:unit?.abbreviation||''});this.formError.set('');}
  async saveUnit(){if(this.unitForm.invalid || !this.unitForm.value.name?.trim() || !this.unitForm.value.abbreviation?.trim()){this.formError.set('Informe nome e abreviação válidos.');return;}const row=this.unitEditing();const value={name:this.unitForm.controls.name.value.trim().replace(/\s+/g,' '),abbreviation:this.unitForm.controls.abbreviation.value.trim().replace(/\s+/g,' ')};if(this.units().some(u=>u.id!==row?.id&&(this.normalize(u.name)===this.normalize(value.name)||this.normalize(u.abbreviation)===this.normalize(value.abbreviation)))){this.formError.set('Já existe uma unidade com este nome ou abreviação.');return;}this.saving.set(true);try{unwrap(row?await this.data.db.from('measurement_units').update(value).eq('id',row.id).select('id').single():await this.data.db.from('measurement_units').insert(value).select('id').single());this.unitEditing.set(undefined);await this.load();this.feedback.toast('Unidade salva.');}catch(e){this.formError.set((e as Error).message);}finally{this.saving.set(false);}}
  async removeUnit(unit:MeasurementUnit){if(!await this.feedback.confirm('Excluir unidade?',unit.name+'. Unidades usadas em pedidos não podem ser excluídas.','Excluir'))return;try{unwrap(await this.data.db.from('measurement_units').delete().eq('id',unit.id).select('id').single());await this.load();}catch(e){this.error.set((e as Error).message);}}
  async toggle(row: Product) {
    if (
      !(await this.feedback.confirm(
        "Alterar status do produto?",
        row.name + ". Os itens de pedidos anteriores serão preservados.",
      ))
    )
      return;
    try {
      unwrap(
        await this.data.db
          .from("products")
          .update({ active: !row.active })
          .eq("id", row.id)
          .select("id")
          .single(),
      );
      await this.load();
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
}
