"use client";

// Cloudflare Turnstile, reduced to one question: is there a person here?
//
// The widget is only ever built when somebody asks for a link, so the script
// isn't fetched on a visit that never shares anything — which keeps the
// recorder's page free of a third-party request it doesn't need.

import { siteConfig } from "@/lib/site";

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface Turnstile {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
      appearance?: "always" | "execute" | "interaction-only";
    },
  ) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;

function load(): Promise<Turnstile> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Turnstile needs a browser."));
  }
  if (window.turnstile) return Promise.resolve(window.turnstile);
  // Fetched once however many times a link is asked for.
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile loaded but isn't there."));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error("Couldn't reach the verification service."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export interface Widget {
  /** The token, once there is one. Rejects if the check fails or is dismissed. */
  token: Promise<string>;
  /** Takes the widget out of the page. */
  dispose: () => void;
}

/**
 * Put a widget in `container` and wait for it to say yes.
 *
 * Managed mode means most people see nothing at all and the token arrives on
 * its own; the ones it isn't sure about get a checkbox. Either way this
 * resolves once, and a failure is a rejection rather than a hang.
 */
export function verify(container: HTMLElement, theme: "light" | "dark" = "dark"): Widget {
  let id: string | null = null;
  let done = false;

  const token = new Promise<string>((resolve, reject) => {
    load().then(
      (turnstile) => {
        id = turnstile.render(container, {
          sitekey: siteConfig.turnstileSiteKey,
          theme,
          callback: (value) => {
            done = true;
            resolve(value);
          },
          "error-callback": () => {
            if (!done) reject(new Error("The verification didn't go through."));
          },
          "expired-callback": () => {
            // A token is only good for a few minutes. Rather than hand a stale
            // one to the endpoint, ask again.
            if (id) window.turnstile?.reset(id);
          },
        });
      },
      (error) => reject(error),
    );
  });

  return {
    token,
    dispose: () => {
      if (id) window.turnstile?.remove(id);
      id = null;
    },
  };
}
