// Blueprint 6.4 SlotField: the unfilled cell of a draft. Until an engineer fills it the cell carries the fixed
// literal REQUIRES ENGINEER INPUT (9.6 DraftField `is_slot`, the constant of src/lib/fixed-strings.ts, hatched the
// way an unfilled cell is hatched on a drawing) and the note entry the surface passes as `children`; after capture
// it carries the note as an attributed block that no reader could mistake for a document citation: the author's
// role alias, the date, the text, the optional source reference, and the fixed provenance of 9.6, which stays
// "human, dated, unreviewed" for the life of the note.
//
// AC-LOOP-11's two visible facts: while the carrying lesson is unpublished the note states that it is not citeable,
// and once the lesson is published the fixed unverified-value line of 9.6 renders under it, through CaveatLine,
// which reads the wording from the contract. The drafter never writes a slot and this component offers no way to,
// which is why the entry is passed in rather than built here.
import type { ReactNode } from "react";
import type { SmeNote } from "@/contracts/generated/drafts";
import { SLOT_TEXT } from "@/lib/fixed-strings";
import { CaveatLine } from "./CaveatLine";
import { cx } from "./cx";
import "./drafts.css";

export type SlotFieldProps = {
  /** The element the slot stands in (9.6 DraftField.id); the note is captured against it. */
  fieldId: string;
  /** The notes captured against this slot, oldest first; empty until an engineer fills it. */
  notes?: readonly SmeNote[];
  /** The note entry, or the reason the viewer has none; rendered under the literal. */
  children?: ReactNode;
  className?: string;
};

const PEN = (
  <svg viewBox="0 0 14 14" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.6 12.4h10.8M2.6 9.6l6.2-6.2 2.2 2.2-6.2 6.2-2.9.7z" />
  </svg>
);

/** The date of the note, as 9.6 records it: the calendar day of the server timestamp. */
function dateOf(capturedAt: string): string {
  return capturedAt.slice(0, 10);
}

function Note({ note }: { note: SmeNote }) {
  return (
    <figure className="note" data-component="sme-note" data-citeable={note.citeable ? "true" : "false"}>
      <figcaption className="note-head">
        <span className="who">{note.author_alias}</span>
        <span>{note.author_role}</span>
        <span>{dateOf(note.captured_at)}</span>
      </figcaption>
      <p>{note.text}</p>
      <div className="note-foot">
        <span>{note.provenance}</span>
        {note.source_reference === null ? null : <span>source: {note.source_reference}</span>}
        <span>{note.citeable ? "citeable" : "not citeable until the carrying lesson is published"}</span>
      </div>
      {note.citeable ? <CaveatLine kind="unverified_value" className="mt-2" /> : null}
    </figure>
  );
}

export function SlotField({ fieldId, notes = [], children, className }: SlotFieldProps) {
  return (
    <div className={cx("slot", className)} data-component="slot-field" data-field={fieldId}>
      <p className="slot-literal">
        {PEN}
        <span>{SLOT_TEXT}</span>
      </p>
      {notes.length > 0 || children ? (
        <div className="slot-body">
          {notes.map((note) => (
            <Note key={note.id} note={note} />
          ))}
          {children}
        </div>
      ) : null}
    </div>
  );
}
