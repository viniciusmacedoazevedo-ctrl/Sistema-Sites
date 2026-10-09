/** A tarefa não pode prosseguir até que o usuário configure algo (chave, preço, opção). */
export class WaitingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaitingConfigError";
  }
}

/** A tarefa depende de uma autorização (ex.: opt-in) que não existe. */
export class WaitingAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaitingAuthError";
  }
}

/** O limite de gastos foi atingido; a tarefa é ignorada sem gerar custo. */
export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

/** Ignorar a tarefa intencionalmente (sem erro). */
export class SkipJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkipJobError";
  }
}

/** Erro que não adianta tentar novamente. */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}
