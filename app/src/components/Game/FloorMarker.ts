import { formatAltitude } from "../../lib/units";

export type FloorMarkerProps = {
  y: number;
  altitude: number;
  scale: number;
};

/** A small world measurement anchored to its platform height; no full-width grid. */
export function drawFloorMarker(
  ctx: CanvasRenderingContext2D,
  { y, altitude, scale }: FloorMarkerProps
): void {
  ctx.save();
  const s = Math.min(1.65, scale);
  const labelY = y - 5 * s;
  ctx.strokeStyle = "#c6c0b6";
  ctx.lineWidth = 1.25 * s;
  ctx.beginPath();
  ctx.moveTo(4 * s, labelY - 3 * s);
  ctx.lineTo(14 * s, labelY - 3 * s);
  ctx.stroke();
  ctx.font = `${Math.round(9 * s)}px monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#c6c0b6";
  ctx.fillText(formatAltitude(altitude, 0).toUpperCase(), 18 * s, labelY);
  ctx.restore();
}
