// DEVELOPMENT-ONLY preview of every UI component and state, with fixture data.
// Production builds return 404. Nothing here touches the database.

import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { destinationPhoto, PHOTOS } from "@/lib/photos";
import {
  computeResults,
  DEALBREAKER_LABELS,
  DEALBREAKER_TAGS,
  type DateWindow,
  type Destination,
  type ParticipantResponse,
} from "@/lib/scoring";
import { Badge, type BadgeTone } from "@/app/ui/badge";
import { Button, ButtonLink, type ButtonVariant } from "@/app/ui/button";
import { ChoiceCard, ChoiceGroup } from "@/app/ui/choice";
import { CopyField } from "@/app/ui/copy-field";
import { DecisionBanner } from "@/app/ui/decision-banner";
import { BudgetField, PinField, TextField } from "@/app/ui/fields";
import { Notice } from "@/app/ui/notice";
import { Page } from "@/app/ui/page-shell";
import { PhotoHeader } from "@/app/ui/photo-header";
import { ResultsList } from "@/app/ui/results";
import { SaveThisLink } from "@/app/ui/save-this-link";
import { StatusList } from "@/app/ui/status-list";
import { DemoConfirmDialog, DemoSubmitForm } from "./demos";

export const metadata = { title: "UI preview (dev only)" };

// ---------- Fixtures ----------

const FRIENDS = ["Asha", "Bilal", "Chirag", "Dev", "Esha"];

const WINDOWS: DateWindow[] = [
  { id: "w1", label: "12–16 Dec", start: "2026-12-12", end: "2026-12-16" },
  { id: "w2", label: "30 Dec – 3 Jan", start: "2026-12-30", end: "2027-01-03" },
  { id: "w3", label: "20–24 Jan", start: "2027-01-20", end: "2027-01-24" },
];

const DESTINATIONS: Destination[] = [
  { id: "goa", name: "Goa", costPerPersonInr: 12000, bestMonths: [11, 12, 1, 2], tripType: "beach", attributes: [] },
  {
    id: "manali",
    name: "Manali",
    costPerPersonInr: 15000,
    bestMonths: [3, 4, 5, 6, 10],
    tripType: "hills",
    attributes: ["overnight_journey"],
  },
  {
    id: "santorini",
    name: "Santorini",
    costPerPersonInr: 95000,
    bestMonths: [5, 6, 7, 8, 9],
    tripType: "beach",
    attributes: ["international"],
  },
  {
    id: "jaipur",
    name: "Jaipur",
    costPerPersonInr: 9000,
    bestMonths: [10, 11, 12, 1, 2, 3],
    tripType: "city",
    attributes: ["overnight_journey"],
  },
];

const INTERNATIONAL = Object.fromEntries(
  DESTINATIONS.map((d) => [d.id, { international: d.attributes.includes("international") }]),
);

const RESPONSES: ParticipantResponse[] = [
  { name: "Asha", budgetInr: 20000, availableWindowIds: ["w1", "w2"], dealbreakers: [], tripType: "beach" },
  { name: "Bilal", budgetInr: 15000, availableWindowIds: ["w1"], dealbreakers: [], tripType: "hills" },
  { name: "Chirag", budgetInr: 25000, availableWindowIds: ["w1", "w2", "w3"], dealbreakers: ["international"], tripType: "none" },
  { name: "Dev", budgetInr: 18000, availableWindowIds: ["w1", "w3"], dealbreakers: ["overnight_journey"], tripType: "beach" },
  { name: "Esha", budgetInr: 30000, availableWindowIds: ["w1", "w2"], dealbreakers: ["trekking"], tripType: "city" },
];

// Goa passes; everything else has a problem, so the list is 1 passing + 1 flagged (rule 5).
const RESULTS = computeResults({ participants: FRIENDS, responses: RESPONSES, destinations: DESTINATIONS, windows: WINDOWS });
// Everyone except Esha: no dealbreakers, so up to 3 options pass.
const RESULTS_PASSING = computeResults({
  participants: FRIENDS,
  responses: RESPONSES.slice(0, 4).map((r) => ({ ...r, dealbreakers: [], availableWindowIds: ["w1", "w2", "w3"] })),
  destinations: DESTINATIONS,
  windows: WINDOWS,
});
const RESULTS_NOT_ENOUGH = computeResults({
  participants: FRIENDS,
  responses: RESPONSES.slice(0, 1),
  destinations: DESTINATIONS,
  windows: WINDOWS,
});
const RESULTS_NO_DESTINATIONS = computeResults({
  participants: FRIENDS,
  responses: RESPONSES,
  destinations: [],
  windows: WINDOWS,
});

const CHOSEN = { destinationId: "goa", windowId: "w1" };

const HEADER_PHOTOS = [PHOTOS.goa, PHOTOS.ladakh, PHOTOS.santorini];
const CARD_PHOTOS = [...RESULTS.shown, ...RESULTS_PASSING.shown]
  .map((o) => destinationPhoto(o.destinationId))
  .filter((p) => p !== null);

const BUTTONS: ButtonVariant[] = ["primary", "secondary", "quiet", "decision", "danger-outline"];
const BADGES: BadgeTone[] = [
  "success",
  "warning",
  "flagged",
  "locked",
  "provisional",
  "domestic",
  "international",
  "chosen",
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-xl leading-7 font-medium">{title}</h2>
      {children}
    </section>
  );
}

export default function DevPreview() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <Page
      header={
        <PhotoHeader photo={HEADER_PHOTOS} title="UI preview" subtitle="Answers lock Wed 30 Sep, 11:59 PM IST" />
      }
      creditPhotos={[...HEADER_PHOTOS, PHOTOS.kerala, ...CARD_PHOTOS]}
    >
      <p className="text-sm leading-5 text-muted-fg">
        Development only. Header above crossfades Goa → Ladakh → Santorini (static under reduced motion).
      </p>

      <Section title="PhotoHeader (single photo)">
        <div className="-mx-4">
          <PhotoHeader photo={PHOTOS.kerala} title="Goa gang 2026" subtitle="Answers lock Wed 30 Sep, 11:59 PM IST" />
        </div>
      </Section>

      <Section title="Buttons">
        {BUTTONS.map((v) => (
          <Button key={v} variant={v}>
            {v === "decision" ? "Mark as final" : v === "danger-outline" ? "Lock now" : `${v[0].toUpperCase()}${v.slice(1)}`}
          </Button>
        ))}
        <Button disabled>Disabled</Button>
        <ButtonLink href="/dev" variant="secondary">
          Link styled as a button
        </ButtonLink>
        <DemoSubmitForm />
      </Section>

      <Section title="Fields">
        <TextField label="Trip name" name="tripName" placeholder="Goa gang 2026" helper="Everyone sees this." />
        <TextField label="Trip name" name="tripNameErr" id="trip-name-error-demo" error="Give the trip a name." />
        <TextField label="Start date" name="start" type="date" defaultValue="2026-12-12" />
        <TextField
          label="Deadline time"
          name="deadlineTime"
          type="time"
          defaultValue="23:59"
          helper="Answers lock at this time (India time)."
        />
        <TextField label="Trip name (locked)" name="locked" defaultValue="Goa gang 2026" readOnly />
        <PinField />
        <PinField id="pin-error-demo" defaultValue="123456" error="That PIN isn't right. 7 tries left." />
        <PinField id="pin-paused-demo" disabled error="Too many wrong tries. Try again in 12 minutes." />
        <BudgetField defaultValue="15000" fromCity="Mumbai" />
        <BudgetField id="budget-retype-demo" retype fromCity="Mumbai" />
        <BudgetField id="budget-error-demo" defaultValue="abc" error="Enter your budget in whole rupees, from 1 to 10,00,000." />
      </Section>

      <Section title="Choice cards">
        <ChoiceGroup
          type="checkbox"
          name="windows"
          legend="Which dates can you do?"
          hint="Tick all that work"
          options={WINDOWS.map((w) => ({ value: w.id, label: w.label }))}
          defaultValue={["w1"]}
        />
        <ChoiceGroup
          type="radio"
          name="tripType"
          legend="What kind of trip?"
          error='Pick a trip type, or "No preference".'
          options={[
            { value: "beach", label: "Beach" },
            { value: "hills", label: "Hills" },
            { value: "city", label: "City" },
            { value: "adventure", label: "Adventure" },
            { value: "none", label: "No preference" },
          ]}
        />
        <ChoiceGroup
          type="radio"
          name="tripTypeSelected"
          legend="What kind of trip? (selected)"
          options={[
            { value: "beach", label: "Beach" },
            { value: "hills", label: "Hills" },
          ]}
          defaultValue="beach"
        />
        <ChoiceGroup
          type="checkbox"
          name="dealbreakers"
          legend="Anything you'd rule out?"
          hint="Optional"
          options={DEALBREAKER_TAGS.map((t) => ({
            value: t,
            label: `${DEALBREAKER_LABELS[t][0].toUpperCase()}${DEALBREAKER_LABELS[t].slice(1)}`,
          }))}
        />
        <ChoiceGroup
          type="radio"
          name="lockedChoice"
          legend="Locked group"
          options={[
            { value: "a", label: "Selected, disabled" },
            { value: "b", label: "Unselected, disabled" },
          ]}
          defaultValue="a"
          disabled
        />
        <ChoiceCard type="checkbox" name="single" value="x" label="A single card" description="With a description line" />
      </Section>

      <Section title="Copy fields">
        <CopyField label="Trip link" value="https://dil-chahta-hai.vercel.app/t/k3j9x2m8q7w4" />
        <CopyField label="PIN" value="042917" large />
      </Section>

      <Section title="Notices">
        <Notice tone="info" title="Share these two in your WhatsApp group:">
          Trip link and PIN.
        </Notice>
        <Notice tone="success">Saved at 9:42 PM. You can edit until Wed 30 Sep, 11:59 PM IST</Notice>
        <Notice tone="warning">The PIN has changed. Ask the organiser for the new one.</Notice>
        <Notice tone="error" role="status">
          Couldn&apos;t save. Check your connection and try again.
        </Notice>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          {BADGES.map((t) => (
            <Badge key={t} tone={t} />
          ))}
          <Badge tone="neutral">Neutral</Badge>
        </div>
      </Section>

      <Section title="Who has answered">
        <StatusList
          rows={FRIENDS.map((name, i) => ({
            name,
            submitted: i !== 2,
            updatedAt: i !== 2 ? new Date(Date.UTC(2026, 8, 30, 16, 12 + i * 7)) : null,
          }))}
        />
      </Section>

      <Section title="Decision banner">
        <DecisionBanner destinationName="Goa" windowLabel="12–16 Dec">
          <Button variant="quiet">Clear final choice</Button>
        </DecisionBanner>
      </Section>

      <Section title="Results: passing (chosen) + flagged">
        <div className="flex items-center gap-2">
          <Badge tone="locked" />
        </div>
        <ResultsList
          results={RESULTS}
          destinations={INTERNATIONAL}
          chosen={CHOSEN}
          renderAction={() => <Button variant="decision">Mark as final</Button>}
        />
      </Section>

      <Section title="Results: all passing">
        <Badge tone="provisional">Provisional: can change until Wed 30 Sep, 11:59 PM IST</Badge>
        <ResultsList results={RESULTS_PASSING} destinations={INTERNATIONAL} />
      </Section>

      <Section title="Results: not enough answers">
        <ResultsList results={RESULTS_NOT_ENOUGH} destinations={INTERNATIONAL} />
      </Section>

      <Section title="Results: no destinations">
        <ResultsList results={RESULTS_NO_DESTINATIONS} destinations={INTERNATIONAL} />
      </Section>

      <Section title="Confirm dialog">
        <DemoConfirmDialog />
      </Section>

      <Section title="Save this link">
        <SaveThisLink organiserUrl="https://dil-chahta-hai.vercel.app/o/k3j9x2m8q7w4/Zq8vN2pX7rL4tY9w" />
        <SaveThisLink organiserUrl="https://dil-chahta-hai.vercel.app/o/k3j9x2m8q7w4/Hb3kP9sQ1mV6cX2e" pin="517308" />
      </Section>
    </Page>
  );
}
