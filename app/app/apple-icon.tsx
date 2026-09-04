import { ImageResponse } from "next/og";

// Apple touch icon — code-generated at the size iOS expects, replicating the
// exact mark and colors from app/icon.svg (scaled 32->180, factor 5.625) so
// there's a single source of visual truth, not a second hand-drawn asset.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 15,
          paddingLeft: 37,
          background: "#0a0a0c",
          borderRadius: 39,
        }}
      >
        <div style={{ width: 107, height: 20, borderRadius: 10, background: "#cbf24d" }} />
        <div style={{ width: 79, height: 20, borderRadius: 10, background: "#6b6b8a" }} />
        <div style={{ width: 53, height: 20, borderRadius: 10, background: "#ff5a2c" }} />
      </div>
    ),
    { ...size }
  );
}
