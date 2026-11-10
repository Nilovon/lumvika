import { cn } from "@/lib/utils";
import { TextShimmer, type TextShimmerProps } from "@rerun/ui";

export type { TextShimmerProps };

/**
 * App-flavored shimmer text. Thin wrapper over the shared `@rerun/ui` TextShimmer
 * that preserves the previous behavior: renders as <p> by default, scales the
 * gradient spread with text length, and themes via --color-muted-foreground /
 * --color-background (so existing className overrides keep working).
 */
export function Shimmer({
  as = "p",
  spread = 2,
  scaleSpreadWithLength = true,
  className,
  ...props
}: TextShimmerProps) {
  return (
    <TextShimmer
      as={as}
      spread={spread}
      scaleSpreadWithLength={scaleSpreadWithLength}
      className={cn(
        "[--shimmer-base:var(--color-muted-foreground)] [--shimmer-highlight:var(--color-background)]",
        className
      )}
      {...props}
    />
  );
}
