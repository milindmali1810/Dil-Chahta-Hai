import type { InputHTMLAttributes, ReactNode } from "react";
import { AlertTriangle, Check } from "./icons";

export interface ChoiceCardProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children" | "className"> {
  type: "checkbox" | "radio";
  name: string;
  value: string;
  label: ReactNode;
  /** Optional muted second line. */
  description?: ReactNode;
}

/**
 * A whole-row tappable card: a real checkbox/radio inside a <label>. The selected look
 * (2px orange border, soft fill, check icon, gentle pop) comes from CSS `:has(:checked)`,
 * so it works for controlled and uncontrolled inputs and needs no client JS.
 * The pop plays only when the input is focused (i.e. just ticked), not on page load.
 */
export function ChoiceCard({ type, name, value, label, description, ...rest }: ChoiceCardProps) {
  return (
    <label
      className={
        "group flex min-h-12 cursor-pointer items-center gap-3 rounded-control border border-input-border bg-card px-4 py-3 " +
        "transition-colors duration-150 " +
        "has-[:checked]:border-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:px-[15px] has-[:checked]:py-[11px] " +
        "has-[:checked:focus]:animate-pop " +
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-decision " +
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
      }
    >
      <input
        type={type}
        name={name}
        value={value}
        className="size-5 shrink-0 accent-primary focus-visible:outline-none"
        {...rest}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-base leading-6 font-bold text-fg group-has-[:checked]:text-primary-pressed">
          {label}
        </span>
        {description && <span className="text-sm leading-5 text-muted-fg">{description}</span>}
      </span>
      <Check size={20} className="hidden shrink-0 text-primary-pressed group-has-[:checked]:block" />
    </label>
  );
}

export interface ChoiceOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface ChoiceGroupProps {
  type: "checkbox" | "radio";
  name: string;
  /** Visible group question, rendered as the <legend> (section-title style). */
  legend: ReactNode;
  /** Muted hint under the legend, e.g. "Tick all that work". */
  hint?: ReactNode;
  options: ChoiceOption[];
  /** Initially selected value(s) for uncontrolled use. */
  defaultValue?: string | string[];
  /** Error under the group, linked with aria-describedby. */
  error?: string | null;
  /** Read-only when the trip is locked. */
  disabled?: boolean;
  required?: boolean;
  /** Defaults to `group-{name}`. */
  id?: string;
}

/** A <fieldset> + <legend> of ChoiceCards with 8px gaps. */
export function ChoiceGroup({
  type,
  name,
  legend,
  hint,
  options,
  defaultValue,
  error,
  disabled,
  required,
  id,
}: ChoiceGroupProps) {
  const groupId = id ?? `group-${name}`;
  const selected = defaultValue === undefined ? [] : Array.isArray(defaultValue) ? defaultValue : [defaultValue];
  const hintId = hint ? `${groupId}-hint` : undefined;
  const errorId = error ? `${groupId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset id={groupId} aria-describedby={describedBy} disabled={disabled} className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 font-display text-xl leading-7 font-medium text-fg">{legend}</legend>
      {hint && (
        <p id={hintId} className="-mt-1 text-sm leading-5 text-muted-fg">
          {hint}
        </p>
      )}
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <ChoiceCard
            key={o.value}
            type={type}
            name={name}
            value={o.value}
            label={o.label}
            description={o.description}
            disabled={o.disabled}
            required={type === "radio" ? required : undefined}
            defaultChecked={selected.includes(o.value)}
          />
        ))}
      </div>
      {error && (
        <p id={errorId} className="flex items-start gap-2 text-sm leading-5 font-bold text-error">
          <AlertTriangle size={18} className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </fieldset>
  );
}
