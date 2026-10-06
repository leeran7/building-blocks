// Shared core: generate -> validate -> write -> preview -> snippet.
// Used by bin/render-3d.mjs and mcp-server/server.mjs.
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { createBackend, backendName } from "./backend.mjs";
import { validateContract } from "./scaffold.mjs";
import { preview, assertCodeSize } from "./chrome.mjs";

export const PLACEMENTS = ["hero", "product", "background"];
export const BUDGETS = ["low", "medium", "high"];

/**
 * Resolve `p` and require it to stay inside `base`. Throws otherwise.
 * Use at trust boundaries (e.g. MCP tool args) where the caller is not
 * the local operator.
 */
export function resolveConfined(base, p) {
  const baseDir = resolve(base);
  const target = resolve(baseDir, p);
  if (target !== baseDir && !target.startsWith(baseDir + sep)) {
    throw new Error(`path escapes the allowed base directory: ${p}`);
  }
  return target;
}

export function snippetMd({ placement }) {
  return `# Integration snippet

Generated for placement \`${placement}\`. Requires the \`three\` npm package.

## React component

\`\`\`tsx
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { scene, camera } from "./scene";

export function Hero3D() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(ref.current.clientWidth, ref.current.clientHeight);
    ref.current.appendChild(renderer.domElement);
    let raf = 0;
    const loop = () => { renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    return () => { cancelAnimationFrame(raf); renderer.dispose(); };
  }, []);
  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}
\`\`\`

## Notes

- The module is fully procedural: no external assets to host.
- \`preview.png\` (next to \`scene.js\`) is the verified render — what you see is what ships.
- Resize handling and scroll-driven camera moves are left to the page;
  the exported \`scene\` and \`camera\` are yours to animate.
`;
}

export function checkArgs({ placement = "hero", budget = "medium" }) {
  if (!PLACEMENTS.includes(placement)) {
    throw new Error(`bad placement "${placement}" (want ${PLACEMENTS.join("|")})`);
  }
  if (!BUDGETS.includes(budget)) {
    throw new Error(`bad budget "${budget}" (want ${BUDGETS.join("|")})`);
  }
  return { placement, budget };
}

export async function renderScene({
  prompt,
  placement = "hero",
  style = "",
  budget = "medium",
  outDir = "./render-3d-out",
  width = 1280,
  height = 800,
  doPreview = true,
  backend: backendOpt,
} = {}) {
  if (!prompt) throw new Error("prompt is required");
  checkArgs({ placement, budget });

  const backend = await createBackend(backendOpt);
  const started = Date.now();
  const { code } = await backend.generateSceneCode({ prompt, placement, style, budget });
  assertCodeSize(code);

  const contract = validateContract(code);
  if (!contract.ok) {
    throw new Error(`contract failed: ${contract.errors.join("; ")}`);
  }

  // Only create the output dir once we know we have valid code to write.
  const dir = resolve(outDir);
  await mkdir(dir, { recursive: true });

  const scenePath = join(dir, "scene.js");
  await writeFile(scenePath, code);

  let previewPath = null;
  if (doPreview) {
    const result = await preview(code, {
      width, height,
      outPath: join(dir, "preview.png"),
    });
    if (!result.ok) {
      const err = new Error(`preview gate FAILED: ${result.error}`);
      err.scenePath = scenePath;
      throw err;
    }
    previewPath = result.previewPath;
  }

  const snippetPath = join(dir, "snippet.md");
  await writeFile(snippetPath, snippetMd({ placement }));

  return {
    ok: true,
    backend: backend.name || backendName(),
    placement,
    budget,
    scene: scenePath,
    preview: previewPath,
    snippet: snippetPath,
    code,
    ms: Date.now() - started,
  };
}
