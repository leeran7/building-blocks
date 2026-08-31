/**
 * Shared ImageResponse trees for listing, recording, and record cards.
 * System-ui only — no Google font fetch that can 500.
 *
 * Satori (@vercel/og) requires display:flex|contents|none on any element
 * with more than one child. Mixed JSX like `{value}m` is two children and
 * 500s the route. Production /api/og already dies on that. OgBox locks
 * display:flex; text is a single string child.
 */

import type { CSSProperties, ReactNode } from "react";
import { OG_PALETTE } from "./palette";
import type { ListingOgModel } from "./listingModel";

const FONT = "system-ui, -apple-system, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export function ListingOgCard(model: ListingOgModel) {
  const p = model.palette;
  const altNum = Number(model.alt);
  const altLabel = Number.isFinite(altNum) ? altNum.toFixed(1) : "0.0";

  return (
    <OgBox
      style={{
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: p.void,
        fontFamily: FONT,
        color: p.textPrimary,
        position: "relative",
      }}
    >
      <OgBox
        style={{
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: "0.3em",
          color: p.signal,
          textTransform: "uppercase",
          marginBottom: 20,
        }}
      >
        DOOMSTACK
      </OgBox>
      <OgBox
        style={{
          alignItems: "center",
          justifyContent: "center",
          background: p.signal,
          color: p.void,
          borderRadius: 8,
          padding: "4px 16px",
          fontSize: 20,
          fontWeight: 700,
          marginBottom: 16,
        }}
      >
        {`#${model.rank}`}
      </OgBox>
      <OgBox
        style={{
          fontSize: 48,
          fontWeight: 800,
          textAlign: "center",
          maxWidth: "80%",
          lineHeight: 1.2,
          marginBottom: 12,
        }}
      >
        {model.name}
      </OgBox>
      <OgBox
        style={{
          fontSize: 20,
          color: p.textPrimary,
          marginBottom: 24,
        }}
      >
        {`${altLabel}m altitude`}
      </OgBox>
      <OgBox
        style={{
          fontSize: 16,
          color: p.textPrimary,
          textAlign: "center",
          maxWidth: "60%",
        }}
      >
        Your altitude is permanent. The ground rises instead.
      </OgBox>
      <OgBox
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 8,
          background: p.ember,
        }}
      />
    </OgBox>
  );
}

export function RecordingOgCard(props: {
  peakM: number;
  handle: string | null;
}) {
  const p = OG_PALETTE;
  return (
    <OgBox
      style={{
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: p.void,
        fontFamily: FONT,
        color: p.textPrimary,
        position: "relative",
      }}
    >
      <OgBox
        style={{
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: "0.3em",
          color: p.signal,
          textTransform: "uppercase",
          marginBottom: 16,
        }}
      >
        DOOMSTACK
      </OgBox>
      <OgBox
        style={{
          alignItems: "flex-end",
          color: p.signal,
          lineHeight: 1,
        }}
      >
        <OgBox
          style={{
            fontSize: 72,
            fontWeight: 800,
            fontFamily: MONO,
          }}
        >
          {String(props.peakM)}
        </OgBox>
        <OgBox
          style={{
            fontSize: 28,
            fontWeight: 400,
            marginLeft: 8,
            marginBottom: 8,
          }}
        >
          m
        </OgBox>
      </OgBox>
      {props.handle ? (
        <OgBox style={{ fontSize: 22, marginTop: 16, color: p.textPrimary }}>
          {props.handle}
        </OgBox>
      ) : null}
      <OgBox
        style={{
          fontSize: 18,
          marginTop: 20,
          color: p.textPrimary,
        }}
      >
        Watch the replay
      </OgBox>
      <OgBox
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 8,
          background: p.ember,
        }}
      />
    </OgBox>
  );
}

export function RecordOgCard(props: {
  displayName: string;
  altitudeM: number;
}) {
  const p = OG_PALETTE;
  return (
    <OgBox
      style={{
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: p.void,
        fontFamily: FONT,
        color: p.textPrimary,
        position: "relative",
      }}
    >
      <OgBox
        style={{
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: "0.3em",
          color: p.signal,
          textTransform: "uppercase",
          marginBottom: 16,
        }}
      >
        DOOMSTACK
      </OgBox>
      <OgBox
        style={{
          fontSize: 44,
          fontWeight: 800,
          textAlign: "center",
          maxWidth: "80%",
          lineHeight: 1.2,
          marginBottom: 12,
        }}
      >
        {props.displayName}
      </OgBox>
      <OgBox
        style={{
          fontSize: 28,
          fontFamily: MONO,
          color: p.signal,
        }}
      >
        {`${props.altitudeM}m`}
      </OgBox>
      <OgBox
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 8,
          background: p.ember,
        }}
      />
    </OgBox>
  );
}

function OgBox({ children, style }: OgBoxProps) {
  return <div style={{ ...style, display: "flex" }}>{children}</div>;
}

interface OgBoxProps {
  children?: ReactNode;
  style?: CSSProperties;
}
