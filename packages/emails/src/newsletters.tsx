import * as React from "react";
import type {
  NewsletterMeta,
  NewsletterProps,
} from "../components/NewsletterLayout";
import MeetTheForeman, {
  meta as meetTheForeman,
} from "../emails/newsletters/2026-09-28-meet-the-foreman";
import MachinesAreBack, {
  meta as machinesAreBack,
} from "../emails/newsletters/2026-09-24-machines-are-back";
import WhatYourAgentThinks, {
  meta as whatYourAgentThinks,
} from "../emails/newsletters/2026-09-18-what-your-agent-thinks";
import AgentsByLink, {
  meta as agentsByLink,
} from "../emails/newsletters/2026-09-11-agents-by-link";
import VoiceAndUploads, {
  meta as voiceAndUploads,
} from "../emails/newsletters/2026-09-04-voice-and-uploads";
import TourAndTemplates, {
  meta as tourAndTemplates,
} from "../emails/newsletters/2026-09-03-tour-and-templates";

// An issue is a file, not a row: it exists the moment it is listed here, and the admin can only
// look at it and send it. `render` is a function rather than a rendered element because every
// recipient gets their own unsubscribe link.
export interface Newsletter extends NewsletterMeta {
  render: (props: NewsletterProps) => React.ReactElement;
}

/** Newest first. */
export const NEWSLETTERS: Newsletter[] = [
  { ...meetTheForeman, render: (props) => <MeetTheForeman {...props} /> },
  { ...machinesAreBack, render: (props) => <MachinesAreBack {...props} /> },
  {
    ...whatYourAgentThinks,
    render: (props) => <WhatYourAgentThinks {...props} />,
  },
  { ...agentsByLink, render: (props) => <AgentsByLink {...props} /> },
  { ...voiceAndUploads, render: (props) => <VoiceAndUploads {...props} /> },
  { ...tourAndTemplates, render: (props) => <TourAndTemplates {...props} /> },
];

export function findNewsletter(slug: string): Newsletter | undefined {
  return NEWSLETTERS.find((n) => n.slug === slug);
}
