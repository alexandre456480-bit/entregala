import {
  Directive,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  afterNextRender,
} from "@angular/core";
@Directive({ selector: "[role=dialog],[role=alertdialog]" })
export class Dialog implements OnDestroy {
  private el = inject<ElementRef<HTMLElement>>(ElementRef);
  private previous = document.activeElement as HTMLElement | null;
  private oldOverflow = document.body.style.overflow;
  constructor() {
    document.body.style.overflow = "hidden";
    afterNextRender(() => {
      const element = this.el.nativeElement;
      const first = element.querySelector<HTMLElement>(
        "[autofocus],button,input,select,textarea,[href]",
      );
      (first || element).focus();
    });
  }
  @HostListener("keydown", ["$event"]) keydown(event: KeyboardEvent) {
    if (event.key !== "Tab") return;
    const all = [
      ...this.el.nativeElement.querySelectorAll<HTMLElement>(
        'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
      ),
    ].filter((e) => e.offsetParent !== null);
    const first = all[0],
      last = all[all.length - 1];
    if (!first) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  ngOnDestroy() {
    document.body.style.overflow = this.oldOverflow;
    this.previous?.focus();
  }
}
