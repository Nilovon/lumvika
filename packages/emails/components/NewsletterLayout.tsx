import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "./Layout";
import { Panel } from "./Panel";
import { text } from "../theme";

/** What an issue needs from the sender: the reader's own unsubscribe link, and where the app lives. */
export interface NewsletterProps {
  appUrl: string;
  unsubscribeUrl: string;
}

/**
 * Who an issue goes to. `product` is every account that kept product emails on; `waitlist` narrows
 * that to the accounts still parked behind the machine waitlist.
 */
export type NewsletterAudience = "product" | "waitlist";

/** Everything the admin list and the send need to know about an issue without rendering it. */
export interface NewsletterMeta {
  /** Stable key of the issue, used as the database key of a send. */
  slug: string;
  subject: string;
  /** The preheader, the line inboxes show next to the subject. */
  preview: string;
  /** Editorial date of the issue, ISO. */
  date: string;
  /** Absent means `product`. */
  audience?: NewsletterAudience;
}

export interface NewsletterLayoutProps extends NewsletterProps {
  meta: NewsletterMeta;
  title: string;
  intro: React.ReactNode;
  /** Framed preamble above the lead, for what the reader needs before the issue itself. */
  note?: React.ReactNode;
  children: React.ReactNode;
}

const ISSUE_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function NewsletterLayout({
  meta,
  title,
  intro,
  note,
  children,
  appUrl,
  unsubscribeUrl,
}: NewsletterLayoutProps) {
  return (
    <Layout
      preview={meta.preview}
      hero={{ newsletter: meta.slug }}
      appUrl={appUrl}
      unsubscribeUrl={unsubscribeUrl}
      unsubscribeLabel="Unsubscribe from product updates"
    >
      <Text style={issue}>
        Product update · {ISSUE_DATE.format(new Date(meta.date))}
      </Text>
      <Heading style={heading}>{title}</Heading>
      {note ? (
        <Panel tone="brand" style={noteFrame}>
          {note}
        </Panel>
      ) : null}
      <Text style={text.paragraph}>{intro}</Text>
      <Section>{children}</Section>
    </Layout>
  );
}

const issue: React.CSSProperties = {
  ...text.label,
  margin: "0 0 12px",
};

const heading: React.CSSProperties = {
  ...text.heading,
  margin: "0 0 12px",
};

const noteFrame: React.CSSProperties = {
  margin: "0 0 16px",
};
