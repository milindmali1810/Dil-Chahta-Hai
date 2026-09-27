"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { createTrip } from "@/app/actions";
import { PHOTOS } from "@/lib/photos";
import { Button } from "@/app/ui/button";
import { TextField } from "@/app/ui/fields";
import { AlertTriangle, Check, X } from "@/app/ui/icons";
import { Notice } from "@/app/ui/notice";
import { Page } from "@/app/ui/page-shell";
import { PhotoHeader } from "@/app/ui/photo-header";
import { SubmitButton } from "@/app/ui/submit-button";
import {
  buildCreateTripInput,
  DEFAULT_DEADLINE_TIME,
  errorFieldFor,
  formValuesFrom,
  NAMES_MAX,
  NAMES_MIN,
  NAMES_START,
  WINDOWS_MAX,
  WINDOWS_MIN,
  type ErrorField,
} from "./create-trip-input";
import { CreatedScreen, type CreatedTrip } from "./created-screen";

const HEADER_PHOTOS = [PHOTOS.goa, PHOTOS.ladakh, PHOTOS.santorini];

const FAILED = "Couldn't create the trip. Check your connection and try again.";

type FormState =
  | { status: "idle" }
  | { status: "error"; message: string; field: ErrorField | null }
  | ({ status: "created" } & CreatedTrip);

async function submit(_prev: FormState, formData: FormData): Promise<FormState> {
  const input = buildCreateTripInput(formValuesFrom(formData));
  try {
    const result = await createTrip(input);
    if (result.ok) {
      return { status: "created", tripId: result.tripId, pin: result.pin, organiserToken: result.organiserToken };
    }
    return { status: "error", message: result.message, field: errorFieldFor(result.message) };
  } catch {
    return { status: "error", message: FAILED, field: null };
  }
}

interface NameRow {
  id: number;
  value: string;
}

interface WindowRow {
  id: number;
  start: string;
  end: string;
}

const CARD = "flex flex-col gap-4 rounded-card border border-border bg-card p-4 shadow-card min-[400px]:p-5";
const H2 = "font-display text-xl leading-7 font-medium";
const ERROR_INPUT = "border-2 border-error!";

/** Error under a group of fields (a date row, the names list, the deadline). */
function GroupError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} className="flex items-start gap-2 text-sm leading-5 font-bold text-error">
      <AlertTriangle size={18} className="mt-px shrink-0" />
      <span>{message}</span>
    </p>
  );
}

function RemoveButton({ label, onClick, children }: { label: string; onClick: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-1 rounded-control px-3 font-bold text-primary transition-colors duration-150 hover:bg-primary-soft active:bg-primary-soft"
    >
      <X />
      {children}
    </button>
  );
}

/** Create-trip form on `/`; swaps to the "created" screen after a successful createTrip. */
export function CreateTrip() {
  const [state, formAction] = useActionState(submit, { status: "idle" });

  // Controlled rows, so values survive React's form reset after the action.
  const [tripName, setTripName] = useState("");
  const [names, setNames] = useState<NameRow[]>(() =>
    Array.from({ length: NAMES_START }, (_, i) => ({ id: i, value: "" })),
  );
  const [windows, setWindows] = useState<WindowRow[]>(() =>
    Array.from({ length: WINDOWS_MIN }, (_, i) => ({ id: i, start: "", end: "" })),
  );
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineTime, setDeadlineTime] = useState(DEFAULT_DEADLINE_TIME);
  const nextId = useRef(100);
  const [focusId, setFocusId] = useState<number | null>(null);

  const noticeRef = useRef<HTMLDivElement>(null);
  const createdRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (state.status === "error") noticeRef.current?.focus();
    if (state.status === "created") createdRef.current?.focus();
  }, [state]);

  const created = state.status === "created" ? state : null;
  const error = state.status === "error" ? state : null;
  const field = error?.field ?? null;
  const message = error?.message ?? null;
  const fieldError = (kind: ErrorField["kind"]) => (field?.kind === kind ? message : null);
  const windowError = (i: number) => (field?.kind === "window" && field.index === i ? message : null);

  function addName() {
    const id = nextId.current++;
    setNames((rows) => [...rows, { id, value: "" }]);
    setFocusId(id);
  }

  function removeName(id: number, index: number) {
    setNames((rows) => rows.filter((r) => r.id !== id));
    // The row above keeps its id (`name-{index}` is the previous row's 1-based number).
    document.getElementById(`name-${index}`)?.focus();
  }

  function addWindow() {
    const id = nextId.current++;
    setWindows((rows) => [...rows, { id, start: "", end: "" }]);
    setFocusId(id);
  }

  function removeWindow(id: number, index: number) {
    setWindows((rows) => rows.filter((r) => r.id !== id));
    document.getElementById(`window-${index}-start`)?.focus();
  }

  const header = (
    <PhotoHeader
      photo={HEADER_PHOTOS}
      title={
        created ? (
          <span ref={createdRef} tabIndex={-1} className="inline-flex items-center gap-2 focus:outline-none">
            Trip created <Check size={28} />
          </span>
        ) : (
          "Plan the trip"
        )
      }
    />
  );

  if (created) {
    return (
      <Page header={header} creditPhotos={HEADER_PHOTOS}>
        <CreatedScreen tripId={created.tripId} pin={created.pin} organiserToken={created.organiserToken} />
      </Page>
    );
  }

  const namesError = fieldError("names");
  const windowsError = fieldError("windows");
  const deadlineError = fieldError("deadline");

  return (
    <Page header={header} creditPhotos={HEADER_PHOTOS}>
      <form action={formAction} noValidate className="flex flex-col gap-8">
        <p className="text-base leading-6 text-muted-fg">
          One link for everyone. Everyone adds their dates and budget; the app ranks the options.
        </p>

        <section className={CARD}>
          <TextField
            label="Trip name"
            name="tripName"
            placeholder="Goa gang 2026"
            autoComplete="off"
            maxLength={60}
            value={tripName}
            onChange={(e) => setTripName(e.target.value)}
            error={fieldError("tripName")}
          />
        </section>

        <section className={CARD} aria-labelledby="names-title">
          <div className="flex flex-col gap-1">
            <h2 id="names-title" className={H2}>
              Who&apos;s going?
            </h2>
            <p className="text-sm leading-5 text-muted-fg">
              {NAMES_MIN} to {NAMES_MAX} people. Leave spare rows blank.
            </p>
          </div>
          <div
            role="group"
            aria-labelledby="names-title"
            aria-describedby={namesError ? "names-error" : undefined}
            className="flex flex-col gap-3"
          >
            {names.map((row, i) => (
              <div key={row.id} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <TextField
                    label={`Name ${i + 1}`}
                    name="participantName"
                    id={`name-${i + 1}`}
                    autoComplete="off"
                    maxLength={30}
                    autoFocus={row.id === focusId}
                    value={row.value}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNames((rows) => rows.map((r) => (r.id === row.id ? { ...r, value } : r)));
                    }}
                    aria-invalid={namesError ? true : undefined}
                    className={namesError ? ERROR_INPUT : undefined}
                  />
                </div>
                {i >= NAMES_MIN && (
                  <RemoveButton label={`Remove name ${i + 1}`} onClick={() => removeName(row.id, i)} />
                )}
              </div>
            ))}
          </div>
          {namesError && <GroupError id="names-error" message={namesError} />}
          {names.length < NAMES_MAX ? (
            <Button variant="quiet" fullWidth={false} onClick={addName} className="self-start px-2">
              + Add person
            </Button>
          ) : (
            <p className="text-sm leading-5 text-muted-fg">That&apos;s the most: {NAMES_MAX} people.</p>
          )}
        </section>

        <section className={CARD} aria-labelledby="windows-title">
          <div className="flex flex-col gap-1">
            <h2 id="windows-title" className={H2}>
              Date options
            </h2>
            <p className="text-sm leading-5 text-muted-fg">
              Add {WINDOWS_MIN} or {WINDOWS_MAX} date ranges
            </p>
          </div>
          {windows.map((row, i) => {
            const n = i + 1;
            const rowError = windowError(i) ?? windowsError;
            const errorId = rowError ? `window-${n}-error` : undefined;
            const inputError = {
              "aria-describedby": errorId,
              "aria-invalid": rowError ? true : undefined,
              className: rowError ? ERROR_INPUT : undefined,
            };
            return (
              <div
                key={row.id}
                role="group"
                aria-labelledby={`window-${n}-label`}
                className={`flex flex-col gap-2 ${i > 0 ? "border-t border-border pt-4" : ""}`}
              >
                <div className="flex min-h-12 items-center justify-between gap-2">
                  <p id={`window-${n}-label`} className="font-bold">
                    Option {n}
                  </p>
                  {i >= WINDOWS_MIN && (
                    <RemoveButton label={`Remove option ${n}`} onClick={() => removeWindow(row.id, i)}>
                      <span aria-hidden="true">Remove</span>
                    </RemoveButton>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
                  <TextField
                    label="Start date"
                    name="windowStart"
                    id={`window-${n}-start`}
                    type="date"
                    autoFocus={row.id === focusId}
                    value={row.start}
                    onChange={(e) => {
                      const start = e.target.value;
                      setWindows((rows) => rows.map((r) => (r.id === row.id ? { ...r, start } : r)));
                    }}
                    {...inputError}
                  />
                  <TextField
                    label="End date"
                    name="windowEnd"
                    id={`window-${n}-end`}
                    type="date"
                    value={row.end}
                    onChange={(e) => {
                      const end = e.target.value;
                      setWindows((rows) => rows.map((r) => (r.id === row.id ? { ...r, end } : r)));
                    }}
                    {...inputError}
                  />
                </div>
                {rowError && errorId && <GroupError id={errorId} message={rowError} />}
              </div>
            );
          })}
          {windows.length < WINDOWS_MAX && (
            <Button variant="quiet" fullWidth={false} onClick={addWindow} className="self-start px-2">
              + Add option
            </Button>
          )}
        </section>

        <section className={CARD} aria-labelledby="deadline-title">
          <h2 id="deadline-title" className={H2}>
            Deadline
          </h2>
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            <TextField
              label="Date"
              name="deadlineDate"
              id="deadline-date"
              type="date"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
              aria-describedby={deadlineError ? "deadline-help deadline-error" : "deadline-help"}
              aria-invalid={deadlineError ? true : undefined}
              className={deadlineError ? ERROR_INPUT : undefined}
            />
            <TextField
              label="Time"
              name="deadlineTime"
              id="deadline-time"
              type="time"
              value={deadlineTime}
              onChange={(e) => setDeadlineTime(e.target.value)}
              aria-describedby={deadlineError ? "deadline-help deadline-error" : "deadline-help"}
              aria-invalid={deadlineError ? true : undefined}
              className={deadlineError ? ERROR_INPUT : undefined}
            />
          </div>
          <p id="deadline-help" className="text-sm leading-5 text-muted-fg">
            Answers lock at this time (India time).
          </p>
          {deadlineError && <GroupError id="deadline-error" message={deadlineError} />}
        </section>

        <div className="flex flex-col gap-4">
          {error && (
            <Notice tone="error" ref={noticeRef} tabIndex={-1}>
              <p>{error.message}</p>
            </Notice>
          )}
          <SubmitButton pendingLabel="Creating…">Create trip</SubmitButton>
        </div>
      </form>
    </Page>
  );
}
