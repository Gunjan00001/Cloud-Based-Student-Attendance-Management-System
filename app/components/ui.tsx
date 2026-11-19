export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-muted" role="status">
      <span
        aria-hidden="true"
        className="inline-block size-4 animate-spin rounded-full border-2 border-border border-t-primary"
      />
      {label}
    </span>
  );
}

export function Alert({
  variant = "error",
  children,
}: {
  variant?: "error" | "info" | "success" | "warning";
  children: React.ReactNode;
}) {
  const styles = {
    error: "border-ink bg-ink text-on-primary",
    info: "border-border bg-surface text-ink",
    success: "border-primary-soft bg-primary-soft text-ink",
    warning: "border-ink bg-bg text-ink",
  }[variant];

  return (
    <div role={variant === "error" ? "alert" : "status"} className={cx("flex items-start gap-2 rounded-sm border px-3 py-2 text-sm", styles)}>
      <AlertIcon />
      <span>{children}</span>
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "present" | "absent" | "blue";
  children: React.ReactNode;
}) {
  const styles = {
    neutral: "badge-neutral",
    present: "badge-present",
    absent: "badge-absent",
    blue: "badge-blue",
  }[tone];
  return <span className={cx("badge", styles)}>{children}</span>;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border px-6 py-10 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {body ? <p className="mx-auto mt-2 max-w-[45ch] text-sm text-ink-muted">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  lead,
  actions,
}: {
  title: string;
  lead?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        {lead ? <p className="mt-2 max-w-[65ch] text-sm text-ink-muted">{lead}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="card">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      {note ? <p className="mt-1 text-xs text-ink-muted">{note}</p> : null}
    </div>
  );
}

export function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MinusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 10h10" strokeLinecap="round" />
    </svg>
  );
}

export function DashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 10h8" strokeLinecap="round" strokeDasharray="2 3" />
    </svg>
  );
}

export function AlertIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 3 2.5 16.5h15L10 3Z" strokeLinejoin="round" />
      <path d="M10 8v3.5M10 14v.5" strokeLinecap="round" />
    </svg>
  );
}
