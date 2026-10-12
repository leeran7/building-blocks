import { useEffect, useState } from "react";

export interface FrameSize {
  width: number;
  height: number;
}

function measure(): FrameSize {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/** The iframe's (or window's) inner size, kept current across resizes and rotation. */
export function useFrameSize(): FrameSize {
  const [size, setSize] = useState<FrameSize>(measure);
  useEffect(() => {
    const update = () => {
      const next = measure();
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);
  return size;
}
