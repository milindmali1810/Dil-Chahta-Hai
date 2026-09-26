import type { InputHTMLAttributes, ReactNode } from "react";
import { AlertTriangle } from "./icons";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name" | "children">;

interface FieldProps extends InputProps {
  /** Visible label above the input. */
  label: ReactNode;
  name: string;
  /** Defaults to `field-{name}`. */
  id?: string;
  /** Muted helper line(s) under the input. */
  helper?: ReactNode | ReactNode[];
  /** Error under the field, linked with aria-describedby. */
  error?: string | null;
}

const INPUT_BASE =
  "block w-full min-h-12 rounded-control border bg-card px-4 py-3 text-base leading-6 text-fg " +
  "placeholder:text-muted-fg transition-colors duration-150 " +
  "read-only:bg-bg read-only:text-muted-fg disabled:bg-bg disabled:text-muted-fg disabled:cursor-not-allowed";

function borderFor(error?: string | null) {
  return error ? "border-2 border-error" : "border-input-border";
}

/** Label + helper + error wrapper shared by every field. */
function Field({
  id,
  label,
  helper,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  helper?: ReactNode | ReactNode[];
  error?: string | null;
  children: (describedBy: string | undefined) => ReactNode;
}) {
  const helpers = helper === undefined ? [] : Array.isArray(helper) ? helper : [helper];
  const helperId = helpers.length ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helperId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-base leading-6 font-bold text-fg">
        {label}
      </label>
      {children(describedBy)}
      {helpers.length > 0 && (
        <div id={helperId} className="flex flex-col gap-1 text-sm leading-5 text-muted-fg">
          {helpers.map((h, i) => (
            <p key={i}>{h}</p>
          ))}
        </div>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-2 text-sm leading-5 font-bold text-error">
          <AlertTriangle size={18} className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export type TextFieldProps = FieldProps;

/** Text, date or time input with a visible label, helper and error. 16px text, so iOS doesn't zoom. */
export function TextField({ label, name, id, helper, error, className, type = "text", ...rest }: TextFieldProps) {
  const fieldId = id ?? `field-${name}`;
  return (
    <Field id={fieldId} label={label} helper={helper} error={error}>
      {(describedBy) => (
        <input
          id={fieldId}
          name={name}
          type={type}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={`${INPUT_BASE} ${borderFor(error)} ${className ?? ""}`}
          {...rest}
        />
      )}
    </Field>
  );
}

export interface PinFieldProps extends Omit<FieldProps, "label" | "name" | "type" | "inputMode" | "maxLength"> {
  label?: ReactNode;
  name?: string;
}

/**
 * One 56px input for the 6-digit PIN. Numeric keypad; paste and password managers are
 * allowed (no per-digit boxes, no paste blocking). Pass `disabled` while the PIN is paused.
 */
export function PinField({ label = "Trip PIN", name = "pin", id, helper, error, className, ...rest }: PinFieldProps) {
  const fieldId = id ?? `field-${name}`;
  return (
    <Field id={fieldId} label={label} helper={helper} error={error}>
      {(describedBy) => (
        <input
          id={fieldId}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          spellCheck={false}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={`${INPUT_BASE} ${borderFor(error)} h-14 text-[28px] leading-9 font-bold tabular-nums tracking-[0.3em] ${className ?? ""}`}
          {...rest}
        />
      )}
    </Field>
  );
}

export interface BudgetFieldProps extends Omit<FieldProps, "label" | "name" | "type" | "inputMode" | "helper"> {
  label?: ReactNode;
  name?: string;
  /** "Costs assume travel from {city}." is shown when given. */
  fromCity?: string;
  /** The saved answers came from another session: the field is blank and asks for the budget again. */
  retype?: boolean;
}

/** Budget per person with a "₹" prefix inside and a numeric keypad. */
export function BudgetField({
  label = "Budget per person",
  name = "budgetInr",
  id,
  error,
  fromCity,
  retype = false,
  className,
  ...rest
}: BudgetFieldProps) {
  const fieldId = id ?? `field-${name}`;
  const helper: ReactNode[] = [];
  if (retype) helper.push("Type your budget again");
  helper.push("Your exact number is never shown to the group. It's only used for scoring.");
  if (fromCity) helper.push(`Costs assume travel from ${fromCity}.`);
  return (
    <Field id={fieldId} label={label} helper={helper} error={error}>
      {(describedBy) => (
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-base font-bold text-muted-fg"
          >
            ₹
          </span>
          <input
            id={fieldId}
            name={name}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className={`${INPUT_BASE} ${borderFor(error)} pl-9 font-bold tabular-nums ${className ?? ""}`}
            {...rest}
          />
        </div>
      )}
    </Field>
  );
}
