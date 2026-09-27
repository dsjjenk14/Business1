/** "(202) 555-0100", "202.555.0100", "+1 202 555 0100" → "+12025550100". Null if not a valid US number. */
export function normalizeUSPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** Formats as the user types: "2025550100" → "(202) 555-0100". */
export function formatUSPhone(input: string): string {
  const d = input.replace(/\D/g, '').replace(/^1(?=\d{10})/, '').slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
