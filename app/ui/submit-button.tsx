"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";
import { Loader } from "./icons";

export interface SubmitButtonProps extends Omit<ButtonProps, "type"> {
  /** Shown with a spinner while the form's action runs, e.g. "Saving…". */
  pendingLabel: string;
}

/** Submit button for a `<form action>`: spinner + pending label, disabled while pending. */
export function SubmitButton({ pendingLabel, children, disabled, ...rest }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} aria-disabled={pending || disabled} {...rest}>
      {pending ? (
        <>
          <Loader />
          <span>{pendingLabel}</span>
        </>
      ) : (
        children
      )}
    </Button>
  );
}
