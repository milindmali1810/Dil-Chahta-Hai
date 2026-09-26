import { Badge } from "./badge";
import { formatTimeIst } from "./format";

export interface StatusRow {
  name: string;
  submitted: boolean;
  /** When their answers were last saved (ISO string or Date); shown as "updated 9:42 PM" in IST. */
  updatedAt?: string | Date | null;
}

/** "Who has answered": name, ✓ Submitted / ◷ Pending, and the last-saved time. */
export function StatusList({ rows }: { rows: StatusRow[] }) {
  return (
    <ul className="divide-y divide-border rounded-card border border-border bg-card shadow-card">
      {rows.map((r) => (
        <li key={r.name} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
          <Badge tone={r.submitted ? "success" : "warning"} />
          {r.submitted && r.updatedAt && (
            <span className="w-full text-right text-sm leading-5 text-muted-fg tabular-nums min-[360px]:w-auto">
              updated {formatTimeIst(r.updatedAt)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
