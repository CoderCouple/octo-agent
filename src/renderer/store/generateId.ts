/** Generate a unique ID with a given prefix (e.g., 'agent', 'repo', 'profile'). */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}
