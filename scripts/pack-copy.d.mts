export function loadManifest(packRoot: string): Promise<unknown>;

export function assertSafeDest(dest: string): string;

export function assertSafeOut(destRoot: string, outPath: string): void;

export function hasSkippedSegment(relPath: string): boolean;

export function isSkippedKernelFile(relPath: string): boolean;

export function collectKernelFiles(
  packRoot: string,
  manifest: { kernel?: string[] },
): Promise<string[]>;

export function copyKernel(
  packRoot: string,
  destArg: string,
): Promise<{ destRoot: string; manifest: unknown }>;

export function purgeDoNotCopy(
  destRoot: string,
  manifest: { doNotCopy?: string[] },
): Promise<void>;

export function resetAgentsAndSkills(destRoot: string): Promise<void>;

export function fixLoopGitignore(content: string): string;

export function mergeGitignore(
  destRoot: string,
  snippet: string,
  options?: { overwrite?: boolean },
): Promise<void>;
