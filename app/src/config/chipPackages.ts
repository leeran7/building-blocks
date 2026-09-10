export interface ChipPackage {
  usd: number;
  chips: number;
  bonusPct: number;
}

export const CHIP_PACKAGES: ChipPackage[] = [
  { usd: 5,  chips: 500,   bonusPct: 0 },
  { usd: 10, chips: 1_100, bonusPct: 10 },
  { usd: 20, chips: 2_400, bonusPct: 20 },
  { usd: 50, chips: 6_500, bonusPct: 30 },
];

export function chipsForUsd(usd: number): number {
  const pkg = CHIP_PACKAGES.find((p) => p.usd === usd);
  return pkg ? pkg.chips : usd * 100;
}
