import { Pipe, PipeTransform } from "@angular/core";
@Pipe({ name: "operationTime" })
export class OperationTime implements PipeTransform {
  transform(
    value: string | Date | null | undefined,
    mode: "time" | "date" = "date",
  ): string {
    if (!value) return "Não informado";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Não informado";
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      ...(mode === "date"
        ? ({ day: "2-digit", month: "2-digit" } as const)
        : {}),
      hour: "2-digit",
      minute: "2-digit",
      ...(mode === "time" ? ({ second: "2-digit" } as const) : {}),
    }).format(date);
  }
}
