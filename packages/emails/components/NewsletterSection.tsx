import * as React from "react";
import { Img, Link, Section, Text } from "@react-email/components";
import { Button } from "./Button";
import { theme, text } from "../theme";

export interface NewsletterSectionImage {
  /** Built with newsletterMediaUrl(slug, file). A GIF plays in every client but Outlook desktop,
   *  which freezes it on its first frame, so that frame has to read on its own. */
  src: string;
  width: number;
  /** Left out on purpose in most cases: a stated height keeps the whole box reserved in a client
   *  that blocks remote images, which leaves a hole where the picture should be. */
  height?: number;
  alt: string;
  /** Makes the picture itself the link. The CTA below usually leads to the same place. */
  href?: string;
}

export interface NewsletterSectionProps {
  /** Short kicker above the title. */
  label?: string;
  title: string;
  body: React.ReactNode;
  image?: NewsletterSectionImage;
  cta?: { href: string; label: string };
}

/** One item of an issue: a kicker, a title, a paragraph, and optionally a picture and a link. */
export function NewsletterSection({
  label,
  title,
  body,
  image,
  cta,
}: NewsletterSectionProps) {
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
      {label ? <Text style={kicker}>{label}</Text> : null}
      <Text style={title_}>{title}</Text>
      {image ? <SectionImage {...image} /> : null}
      <Text style={text.paragraph}>{body}</Text>
      {cta ? (
        <Section style={ctaWrap}>
          <Button href={cta.href}>{cta.label}</Button>
        </Section>
      ) : null}
    </Section>
  );
}

function SectionImage({ src, width, height, alt, href }: NewsletterSectionImage) {
  const img = <Img src={src} width={width} height={height} alt={alt} style={art} />;
  return href ? (
    <Link href={href} style={artLink}>
      {img}
    </Link>
  ) : (
    img
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
  margin: "0 0 10px",
};

const artLink: React.CSSProperties = {
  // Stated rather than left to react-email, whose `Link` defaults to its own blue: without it the
  // alt text of a blocked image is painted in a colour the theme never declares.
  color: theme.text.strong,
  display: "block",
  textDecoration: "none",
};

const art: React.CSSProperties = {
  // Explicit, because a linked image draws a blue frame in the older Outlooks without it.
  border: 0,
  borderRadius: theme.radius.inner,
  display: "block",
  height: "auto",
  margin: "0 0 14px",
  maxWidth: "100%",
  width: "100%",
};

const ctaWrap: React.CSSProperties = {
  margin: "18px 0 0",
};
