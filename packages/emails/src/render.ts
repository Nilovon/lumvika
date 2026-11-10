import * as React from "react";
import { render } from "@react-email/components";

/**
 * Render a React Email element to both HTML and plain-text bodies,
 * ready to pass to Resend's emails.send().
 */
export async function renderEmail(
  element: React.ReactElement,
): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return { html, text };
}
