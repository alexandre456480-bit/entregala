export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function dbError(code?: string): ApiError {
  if (code === "42501")
    return new ApiError(
      403,
      "FORBIDDEN",
      "Você não tem permissão para esta ação.",
    );
  if (code === "23505" || code === "40001")
    return new ApiError(
      409,
      "CONFLICT",
      "Os dados foram alterados ou o pedido já foi atribuído. Atualize a tela.",
    );
  if (code === "P0002")
    return new ApiError(404, "NOT_FOUND", "Registro não encontrado.");
  if (code?.startsWith("22") || code?.startsWith("23") || code === "P0001")
    return new ApiError(
      422,
      "INVALID_DATA",
      "Revise os dados. A data, o motorista ou a situação da rota não permitem esta operação.",
    );
  return new ApiError(
    503,
    "UNAVAILABLE",
    "Não foi possível acessar os dados. Tente novamente.",
  );
}
