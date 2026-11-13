import { Component, input } from "@angular/core";
const paths: Record<string, string> = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  shop: "M3 10h18l-2-7H5z M5 10v11h14V10 M9 21v-7h6v7 M3 10c0 3 4 3 4 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 4 3 4 0",
  box: "m3 7 9-5 9 5v10l-9 5-9-5z M3 7l9 5 9-5 M12 12v10 M7 4l10 6",
  route:
    "M5 4a2 2 0 1 0 0 .01 M19 18a2 2 0 1 0 0 .01 M7 4h8a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h8",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  plus: "M12 5v14 M5 12h14",
  search: "M21 21l-5-5 M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16",
  logout: "M9 3H4v18h5 M10 12h11 M16 7l5 5-5 5",
  calendar: "M4 5h16v16H4z M8 2v6 M16 2v6 M4 11h16",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0 M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  chevron: "m9 5 7 7-7 7",
  down: "m5 9 7 7 7-7",
  up: "m5 15 7-7 7 7",
  check: "m5 12 4 4L19 6",
  close: "M6 6l12 12 M18 6 6 18",
  edit: "m15 4 5 5 M4 15 15 4a3 3 0 0 1 5 5L9 20H4z",
  lock: "M5 10h14v12H5z M8 10V6a4 4 0 0 1 8 0v4",
  truck:
    "M2 4h12v13H2z M14 8h4l4 5v4h-8 M6 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M18 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  alert: "m12 3 10 18H2z M12 9v5 M12 17v1",
  clock: "M12 8v5l3 2 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
};
@Component({
  selector: "app-icon",
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path [attr.d]="path()" />
  </svg>`,
  styles: [
    ":host{display:inline-flex;width:20px;height:20px;flex-shrink:0}svg{width:100%;height:100%}",
  ],
})
export class Icon {
  readonly name = input("box");
  path() {
    return paths[this.name()] || paths["box"];
  }
}
