import { Component } from "@angular/core";
@Component({
  selector: "app-load-illustration",
  template: `<svg
    width="72"
    height="72"
    viewBox="0 0 80 80"
    fill="none"
    aria-hidden="true"
  >
    <ellipse cx="39" cy="68" rx="29" ry="7" fill="#174b4a" opacity=".12" />
    <path d="m10 27 28-15 28 15-28 16z" fill="#d8e9c5" />
    <path d="M10 27v29l28 15V43z" fill="#86b496" />
    <path d="M38 43v28l28-15V27z" fill="#2e7062" />
    <path d="m24 20 28 15v12l-8 4V39L17 24z" fill="#edc68d" />
    <path d="m17 47 13 7v6l-13-7z" fill="#e5f0d9" />
    <path d="m38 43 28-16M38 43 10 27" stroke="#f4f8e9" stroke-width="1.5" />
    <circle
      cx="62"
      cy="21"
      r="14"
      fill="#f7faf0"
      stroke="#b9d1ac"
      stroke-width="2"
    />
    <path
      d="m55 21 5 5 9-10"
      stroke="#246256"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>`,
})
export class LoadIllustration {}
