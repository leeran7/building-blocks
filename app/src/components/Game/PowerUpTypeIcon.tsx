import type { PowerUpType } from "../../game/types";
import {
  POWER_UP_ICON_GEOMETRY,
  emitPathCommand,
  type PathCommand,
  type PathSink,
} from "./powerUpVisuals";

export function PowerUpTypeIcon({ type }: PowerUpTypeIconProps) {
  const geometry = POWER_UP_ICON_GEOMETRY[type];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={geometry.viewBox}
      data-power-up-type={type}
      aria-hidden="true"
      focusable="false"
      className="h-full w-full"
    >
      {geometry.layers.map((layer, index) => (
        <path
          key={index}
          d={commandsToSvgD(layer.commands)}
          fill={layer.paint === "fill" ? "currentColor" : "none"}
          fillRule="nonzero"
          stroke={layer.paint === "stroke" ? "currentColor" : undefined}
          strokeWidth={layer.paint === "stroke" ? layer.strokeWidth : undefined}
          strokeLinecap={layer.paint === "stroke" ? "round" : undefined}
          strokeLinejoin={layer.paint === "stroke" ? "round" : undefined}
        />
      ))}
    </svg>
  );
}

type PowerUpTypeIconProps = {
  type: PowerUpType;
};

function commandsToSvgD(commands: readonly PathCommand[]): string {
  const parts: string[] = [];
  const sink: PathSink = {
    moveTo(x, y) {
      parts.push(`M ${x} ${y}`);
    },
    lineTo(x, y) {
      parts.push(`L ${x} ${y}`);
    },
    quadraticCurveTo(x1, y1, x, y) {
      parts.push(`Q ${x1} ${y1} ${x} ${y}`);
    },
    bezierCurveTo(x1, y1, x2, y2, x, y) {
      parts.push(`C ${x1} ${y1} ${x2} ${y2} ${x} ${y}`);
    },
    closePath() {
      parts.push("Z");
    },
  };
  for (const cmd of commands) {
    emitPathCommand(cmd, sink);
  }
  return parts.join(" ");
}
