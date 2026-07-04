import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { siteConfig } from "@/lib/site";

export const runtime = "nodejs";
export const alt = `${siteConfig.name} — ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
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
        gap: 10,
        border: `1px solid ${BORDER}`,
        borderRadius: 999,
        padding: "8px 16px",
        fontSize: 22,
        color: MUTED,
      }}
    >
      <div
        style={{ width: 10, height: 10, borderRadius: 999, background: RED }}
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
            top: 90,
            right: 40,
            width: 620,
            height: 460,
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
            width: 640,
            padding: "0 0 0 80px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={66} height={74} alt="" />
          <div
            style={{
              display: "flex",
              fontSize: 104,
              fontWeight: 700,
              letterSpacing: -2,
              marginTop: 22,
            }}
          >
            {siteConfig.name}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 32,
              fontWeight: 400,
              marginTop: 8,
              color: MUTED,
            }}
          >
            {siteConfig.tagline}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 34 }}>
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
              width: 460,
              height: 388,
              borderRadius: 20,
              border: `1px solid ${BORDER}`,
              background: "#161311",
              boxShadow: "0 40px 100px rgba(0,0,0,0.55)",
              overflow: "hidden",
            }}
          >
            {/* chrome */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "16px 18px",
                borderBottom: `1px solid ${BORDER}`,
              }}
            >
              <div style={{ width: 11, height: 11, borderRadius: 999, background: "rgba(155,147,133,0.35)" }} />
              <div style={{ width: 11, height: 11, borderRadius: 999, background: "rgba(155,147,133,0.35)" }} />
              <div style={{ width: 11, height: 11, borderRadius: 999, background: "rgba(155,147,133,0.35)" }} />
              <div
                style={{
                  display: "flex",
                  margin: "0 auto",
                  padding: "5px 14px",
                  borderRadius: 8,
                  background: "rgba(14,13,12,0.6)",
                  fontSize: 18,
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
                gap: 22,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 128,
                  height: 128,
                  borderRadius: 999,
                  border: `4px solid rgba(246,45,34,0.4)`,
                }}
              >
                <div
                  style={{ width: 58, height: 58, borderRadius: 999, background: RED }}
                />
              </div>
              <div style={{ display: "flex", fontSize: 28, fontWeight: 700 }}>
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
