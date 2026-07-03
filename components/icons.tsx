import type { SVGProps } from "react";

/**
 * GitHub mark as an inline SVG — lucide dropped brand icons, so we ship our own
 * to avoid a dependency on a moving target.
 */
export function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.05.78 2.12v3.14c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}

/** X (Twitter) mark. */
export function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M18.9 1.9h3.5l-7.6 8.7 8.9 11.8h-7l-5.4-7.1-6.2 7.1H1.6l8.1-9.3L1.2 1.9h7.2l4.9 6.5 5.6-6.5Zm-1.2 18.2h1.9L6.4 3.8H4.3l13.4 16.3Z" />
    </svg>
  );
}

/** Bluesky butterfly mark. */
export function BlueskyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 10.8c-.9-1.8-3.4-5.1-5.7-6.7C4.1 2.6 3.2 2.9 2.7 3.2 2 3.5 1.9 4.6 1.9 5.2c0 .7.4 5.5.6 6.3.7 2.7 3.6 3.6 6.2 3.3-3.9.6-7.3 2-2.8 7 4.9 5.1 6.7-1.1 7.7-4.2 1 3.1 2 9.1 7.5 4.2 4.2-4.2 1.2-6.4-2.7-7 2.7.3 5.5-.6 6.2-3.3.2-.8.6-5.6.6-6.3 0-.6-.1-1.7-.8-2C21.7 2.6 20.7 2.5 19 3.8c-2.3 1.6-4.8 4.9-5.7 6.7Z" />
    </svg>
  );
}
