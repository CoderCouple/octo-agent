/** Browser-safe UUID generator. */
export function randomUUID(): string {
  return crypto.randomUUID()
}
