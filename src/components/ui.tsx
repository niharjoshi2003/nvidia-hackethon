import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("rounded-lg border border-zinc-800 bg-zinc-900/50 p-5", className)}
      {...rest}
    />
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">{children}</h1>
      {sub ? <p className="mt-1 text-sm text-zinc-400">{sub}</p> : null}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">{children}</h2>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-amber-400 text-zinc-950 hover:bg-amber-300 disabled:hover:bg-amber-400",
  secondary: "border border-zinc-700 text-zinc-100 hover:border-zinc-500",
  ghost: "text-zinc-400 hover:text-zinc-100",
  danger: "border border-rose-900 text-rose-300 hover:border-rose-700",
};

export function Button({ variant = "secondary", size = "md", className, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm"
          ? "px-2.5 py-1 text-xs"
          : size === "lg"
            ? "rounded-lg px-6 py-3 text-base"
            : "px-4 py-2 text-sm",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  );
}

const BADGE_TONES = {
  neutral: "border-zinc-700 text-zinc-400",
  accent: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  good: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  bad: "border-rose-500/40 bg-rose-500/10 text-rose-300",
} as const;

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium",
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="text-center">
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {children ? <p className="mt-1 text-sm text-zinc-500">{children}</p> : null}
    </Card>
  );
}

/** A rubric line, always rendered so it reads as a quotation from the topic. */
export function RubricLine({ children }: { children: ReactNode }) {
  return (
    <p className="border-l-2 border-zinc-700 pl-3 text-sm text-zinc-300">{children}</p>
  );
}

/** The speaker's own words. Visually distinct from anything a model wrote. */
export function SpokenQuote({ children }: { children: ReactNode }) {
  return (
    <p className="border-l-2 border-amber-400 pl-3 text-sm italic text-zinc-200">
      &ldquo;{children}&rdquo;
    </p>
  );
}
