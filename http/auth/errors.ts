export class ApiKeyNotFoundError extends Error {
  constructor(key: string) {
    super(`API key not found: ${key}`);
    this.name = "ApiKeyNotFoundError";
  }
}
