/**
 * Shared ImageResponse trees for listing, recording, and record cards.
 * System-ui only — no Google font fetch that can 500.
 */

import { OG_PALETTE } from "./palette";
import type { ListingOgModel } from "./listingModel";

const FONT = "system-ui, -apple-system, sans-serif";

export function ListingOgCard(model: ListingOgModel) {
  const p = model.palette;
  const altNum = Number(model.alt);
  const altLabel = Number.isFinite(altNum) ? altNum.toFixed(1) : "0.0";

  return (
    <div
      style={{
        display: "flex",
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
      <div
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
      </div>
      <div
        style={{
          display: "flex",
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
        #{model.rank}
      </div>
      <div
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
      </div>
      <div
        style={{
          fontSize: 20,
          color: p.textPrimary,
          marginBottom: 24,
        }}
      >
        {altLabel}m altitude
      </div>
      <div
        style={{
          fontSize: 16,
          color: p.textPrimary,
          textAlign: "center",
          maxWidth: "60%",
        }}
      >
        Your altitude is permanent. The ground rises instead.
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 8,
          background: p.ember,
        }}
      />
    </div>
  );
}

export function RecordingOgCard(props: {
  peakM: number;
  handle: string | null;
}) {
  const p = OG_PALETTE;
  return (
    <div
      style={{
        display: "flex",
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
      <div
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
      </div>
      <div
        style={{
          fontSize: 72,
          fontWeight: 800,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          color: p.signal,
          lineHeight: 1,
        }}
      >
        {props.peakM}
        <span style={{ fontSize: 28, fontWeight: 400, marginLeft: 8 }}>m</span>
      </div>
      {props.handle ? (
        <div style={{ fontSize: 22, marginTop: 16, color: p.textPrimary }}>
          {props.handle}
        </div>
      ) : null}
      <div
        style={{
          fontSize: 18,
          marginTop: 20,
          color: p.textPrimary,
        }}
      >
        Watch the replay
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 8,
          background: p.ember,
        }}
      />
    </div>
  );
}

export function RecordOgCard(props: {
  displayName: string;
  altitudeM: number;
}) {
  const p = OG_PALETTE;
  return (
    <div
      style={{
        display: "flex",
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
      <div
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
      </div>
      <div
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
      </div>
      <div
        style={{
          fontSize: 28,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          color: p.signal,
        }}
      >
        {props.altitudeM}m
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 8,
          background: p.ember,
        }}
      />
    </div>
  );
}
