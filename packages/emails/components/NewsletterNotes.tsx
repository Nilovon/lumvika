import * as React from "react";
import { Img, Section, Text } from "@react-email/components";
import { NOTE_ICON_SIZE, noteIconUrl, type NoteIcon } from "../assets";
import { text, theme } from "../theme";

export interface NewsletterNote {
  /** From the closed set in assets.ts: a note is skimmed, so its glyph is recognised, not read. */
  icon: NoteIcon;
  title: string;
  /** One line. A note that needs two lines to land is a section, not a note. */
  body: string;
}

export interface NewsletterNotesProps {
  /** Short kicker above the block. */
  label?: string;
  title: string;
  notes: NewsletterNote[];
}

/** The tail of an issue: the fixes and the small improvements, one line each, stacked. Carries no
 *  picture and no button, so the eye slides down it and stops at the sign-off. */
export function NewsletterNotes({
  label = "Also",
  title,
  notes,
}: NewsletterNotesProps) {
  return (
    <Section style={block}>
      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        border={0}
        style={ruleTable}
      >
        <tbody>
          <tr>
            <td height={1} style={rule}>
              &nbsp;
            </td>
          </tr>
        </tbody>
      </table>
      <Text style={kicker}>{label}</Text>
      <Text style={title_}>{title}</Text>
      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        border={0}
        style={list}
      >
        <tbody>
          {notes.map((note, index) => (
            <tr key={note.title}>
              <td style={glyphCell}>
                {/* Decorative, so no alt: a blocked image leaves the gutter empty rather than
                    painting a word next to the title it illustrates. */}
                <Img
                  src={noteIconUrl(note.icon)}
                  width={NOTE_ICON_SIZE}
                  height={NOTE_ICON_SIZE}
                  alt=""
                  style={glyph}
                />
              </td>
              <td
                style={
                  index === notes.length - 1
                    ? { ...noteCell, paddingBottom: 0 }
                    : noteCell
                }
              >
                <Text style={noteTitle}>{note.title}</Text>
                <Text style={noteBody}>{note.body}</Text>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

const block: React.CSSProperties = {
  margin: "24px 0 0",
};

const ruleTable: React.CSSProperties = {
  borderCollapse: "collapse",
  margin: "0 0 20px",
};

const rule: React.CSSProperties = {
  backgroundColor: theme.surface.border,
  fontSize: 0,
  height: "1px",
  lineHeight: "1px",
};

const kicker: React.CSSProperties = {
  ...text.label,
  margin: "0 0 8px",
};

const title_: React.CSSProperties = {
  color: theme.text.strong,
  fontSize: "17px",
  fontWeight: 500,
  letterSpacing: "-0.01em",
  lineHeight: "24px",
  margin: "0 0 16px",
};

const list: React.CSSProperties = {
  borderCollapse: "collapse",
};

const glyphCell: React.CSSProperties = {
  paddingRight: "12px",
  // Lines the glyph up with the cap height of the title next to it rather than with its box.
  paddingTop: "3px",
  verticalAlign: "top",
  width: `${NOTE_ICON_SIZE}px`,
};

const glyph: React.CSSProperties = {
  border: 0,
  borderRadius: "4px",
  display: "block",
};

const noteCell: React.CSSProperties = {
  paddingBottom: "16px",
  verticalAlign: "top",
};

const noteTitle: React.CSSProperties = {
  color: theme.text.strong,
  fontSize: "14px",
  fontWeight: 500,
  lineHeight: "20px",
  margin: "0 0 2px",
};

const noteBody: React.CSSProperties = {
  color: theme.text.muted,
  fontSize: "13px",
  lineHeight: "20px",
  margin: 0,
};
