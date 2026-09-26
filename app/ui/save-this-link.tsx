import { CopyField } from "./copy-field";
import { Notice } from "./notice";

export interface SaveThisLinkProps {
  organiserUrl: string;
  /** Shown too after Regenerate PIN, when the PIN changed as well. */
  pin?: string;
}

/** Warning Notice around the private organiser link (on creation and after Regenerate PIN). */
export function SaveThisLink({ organiserUrl, pin }: SaveThisLinkProps) {
  return (
    <Notice tone="warning" role="status" title="Keep this one to yourself">
      <p>Save this link. It&apos;s the only way to lock or finalise the trip.</p>
      <div className="flex flex-col gap-4 text-fg">
        {pin && <CopyField label="New PIN" value={pin} large />}
        <CopyField label="Organiser link" value={organiserUrl} />
      </div>
    </Notice>
  );
}
