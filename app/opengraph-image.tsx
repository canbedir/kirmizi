import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { siteConfig } from "@/lib/site";

export const runtime = "nodejs";
export const alt = `${siteConfig.name} — ${siteConfig.tagline}`;
// Rendered at 2× (2400×1260, same 1.91:1 ratio) so downscaled social previews
// stay crisp; platforms scale it down cleanly.
const SCALE = 2;
const s = (n: number) => n * SCALE;
export const size = { width: s(1200), height: s(630) };
export const contentType = "image/png";

const RED = "#F6433A";
const TEXT = "#ECE6DA";
const MUTED = "#9B9385";
const BORDER = "rgba(236,230,218,0.10)";

export default async function OpengraphImage() {
  const [bold, regular, logo] = await Promise.all([
    readFile(join(process.cwd(), "app/og-bricolage-700.ttf")),
    readFile(join(process.cwd(), "app/og-bricolage-400.ttf")),
    readFile(join(process.cwd(), "public/kirmizi-logo.png")),
  ]);
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  const pill = (label: string) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: s(10),
        border: `${s(1)}px solid ${BORDER}`,
        borderRadius: 999,
        padding: `${s(8)}px ${s(16)}px`,
        fontSize: s(22),
        color: MUTED,
      }}
    >
      <div
        style={{
          width: s(10),
          height: s(10),
          borderRadius: 999,
          background: RED,
        }}
      />
      {label}
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#0E0D0C",
          color: TEXT,
          fontFamily: "Bricolage",
          position: "relative",
        }}
      >
        {/* red glow pooling behind the product mock */}
        <div
          style={{
            position: "absolute",
            top: s(90),
            right: s(40),
            width: s(620),
            height: s(460),
            background:
              "radial-gradient(50% 50% at 50% 50%, rgba(246,45,34,0.28), rgba(246,45,34,0))",
            display: "flex",
          }}
        />

        {/* Left — brand */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: s(640),
            padding: `0 0 0 ${s(80)}px`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={s(66)} height={s(74)} alt="" />
          <div
            style={{
              display: "flex",
              fontSize: s(104),
              fontWeight: 700,
              letterSpacing: s(-2),
              marginTop: s(22),
            }}
          >
            {siteConfig.name}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: s(32),
              fontWeight: 400,
              marginTop: s(8),
              color: MUTED,
            }}
          >
            {siteConfig.tagline}
          </div>
          <div style={{ display: "flex", gap: s(12), marginTop: s(34) }}>
            {pill("Nothing uploaded")}
            {pill("No signup")}
          </div>
        </div>

        {/* Right — product mock */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: s(460),
              height: s(388),
              borderRadius: s(20),
              border: `${s(1)}px solid ${BORDER}`,
              background: "#161311",
              boxShadow: `0 ${s(40)}px ${s(100)}px rgba(0,0,0,0.55)`,
              overflow: "hidden",
            }}
          >
            {/* chrome */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: s(8),
                padding: `${s(16)}px ${s(18)}px`,
                borderBottom: `${s(1)}px solid ${BORDER}`,
              }}
            >
              <div style={{ width: s(11), height: s(11), borderRadius: 999, background: "rgba(155,147,133,0.35)" }} />
              <div style={{ width: s(11), height: s(11), borderRadius: 999, background: "rgba(155,147,133,0.35)" }} />
              <div style={{ width: s(11), height: s(11), borderRadius: 999, background: "rgba(155,147,133,0.35)" }} />
              <div
                style={{
                  display: "flex",
                  margin: `0 auto`,
                  padding: `${s(5)}px ${s(14)}px`,
                  borderRadius: s(8),
                  background: "rgba(14,13,12,0.6)",
                  fontSize: s(18),
                  color: MUTED,
                }}
              >
                kirmizi.app/record
              </div>
            </div>
            {/* body */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                gap: s(22),
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: s(128),
                  height: s(128),
                  borderRadius: 999,
                  border: `${s(4)}px solid rgba(246,45,34,0.4)`,
                }}
              >
                <div
                  style={{ width: s(58), height: s(58), borderRadius: 999, background: RED }}
                />
              </div>
              <div style={{ display: "flex", fontSize: s(28), fontWeight: 700 }}>
                Start recording
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Bricolage", data: bold, style: "normal", weight: 700 },
        { name: "Bricolage", data: regular, style: "normal", weight: 400 },
      ],
    },
  );
}
