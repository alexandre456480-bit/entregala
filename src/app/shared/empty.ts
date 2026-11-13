import { Component, input } from "@angular/core";
import { Icon } from "./icon";
@Component({
  selector: "app-empty",
  imports: [Icon],
  template: `<div class="empty">
    <div class="empty-icon"><app-icon [name]="icon()" /></div>
    <h3>{{ title() }}</h3>
    <p>{{ message() }}</p>
    <ng-content />
  </div>`,
})
export class Empty {
  title = input("Tudo pronto para começar");
  message = input("Seus registros aparecerão aqui.");
  icon = input("box");
}
