export function loadRules(): Promise<unknown>;

export function lintAgents(root?: string): Promise<{
  filesChecked: number;
  violations: HygieneViolation[];
}>;

export function protocolMarkers(protocolBody: string): {
  start: string;
  end: string;
  block: string;
};

export function stripProtocol(body: string): string;

export function prependProtocol(body: string, protocolBody: string): string;

export type HygieneViolation = {
  file: string;
  kind: string;
  needle: unknown;
};
