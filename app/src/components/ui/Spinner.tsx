import type { HTMLAttributes } from "react";

export function Spinner({
  size = "md",
  className,
  ...props
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
} & HTMLAttributes<HTMLSpanElement>) {
  const sz = { sm: "w-3 h-3", md: "w-4 h-4", lg: "w-8 h-8" }[size];
  return (
    <span
      aria-hidden="true"
      {...props}
      className={`${sz} rounded-full border-2 border-text-muted border-t-signal animate-spin motion-reduce:animate-none shrink-0${className ? ` ${className}` : ""}`}
    />
  );
}
