// One JSON object per line on stderr: easy to grep in a terminal, easy to
// ship to a log pipeline later. Callers pass identifiers, never raw PII.
export function log(event: string, fields: Record<string, unknown> = {}): void {
  if (process.env.LOG_LEVEL === "silent") return;
  process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...fields })}\n`);
}
