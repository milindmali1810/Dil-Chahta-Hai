import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "decision" | "danger-outline";

const BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-5 py-3 " +
  "text-base leading-6 font-bold text-center select-none " +
  "transition-[background-color,color,transform,opacity] duration-150 ease-out " +
  "active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-pressed active:bg-primary-pressed",
  secondary:
    "border-2 border-primary bg-card text-primary hover:bg-primary-soft active:bg-primary-soft",
  quiet: "bg-transparent text-primary underline-offset-4 hover:underline active:text-primary-pressed",
  decision: "bg-decision text-white hover:bg-decision-fg active:bg-decision-fg",
  "danger-outline": "border-2 border-error bg-card text-error hover:bg-error-soft active:bg-error-soft",
};

/** Classes for a button look; `fullWidth` is the phone default (MASTER section 7). */
export function buttonClasses(variant: ButtonVariant = "primary", fullWidth = true, extra = ""): string {
  return `${BASE} ${VARIANTS[variant]} ${fullWidth ? "w-full" : ""} ${extra}`.trim();
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Full width by default; pass false for inline buttons such as Copy. */
  fullWidth?: boolean;
}

export function Button({ variant = "primary", fullWidth = true, className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, fullWidth, className)} {...rest} />;
}

export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

/** A link that looks like a Button (e.g. "Open the trip"). */
export function ButtonLink({ variant = "primary", fullWidth = true, className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, fullWidth, className)} {...rest} />;
}
