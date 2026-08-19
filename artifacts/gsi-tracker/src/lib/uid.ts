/**
 * Generate a unique id for client-created records (notes, contacts).
 * Falls back to a timestamp+random id when crypto.randomUUID is unavailable
 * (it only exists in secure contexts, so plain-HTTP access would crash).
 */
export function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
