import * as React from "react";
import type {
  NewsletterMeta,
  NewsletterProps,
} from "../components/NewsletterLayout";

// An issue is a file, not a row: it exists the moment it is listed here, and the admin can only
// look at it and send it. `render` is a function rather than a rendered element because every
// recipient gets their own unsubscribe link.
export interface Newsletter extends NewsletterMeta {
  render: (props: NewsletterProps) => React.ReactElement;
}

/** Newest first. */
export const NEWSLETTERS: Newsletter[] = [];

export function findNewsletter(slug: string): Newsletter | undefined {
  return NEWSLETTERS.find((n) => n.slug === slug);
}
