/**
 * Credit a qualified view to the active season.
 *
 * DB transaction: UPDATE season_state SET views_k = views_k + 0.001
 *
 * views_k is in thousands — each qualified view = +0.001k = +1 view.
 * The DB CHECK constraint (views_k >= 0) provides last-line-of-defence.
 *
 * This module is NOT called from client-side code.
 * It runs server-side only, in the middleware or internal API route.
 */

export interface CreditViewResult {
  /** New views_k value after increment */
  views_k_new: number;
}

/**
 * Increment views_k by 0.001 in the active season (DB transaction).
 *
 * @param db - database client with the updateSeasonViews method
 * @returns CreditViewResult with new views_k
 */
export async function creditView(db: {
  updateSeasonViews: () => Promise<number>;
}): Promise<CreditViewResult> {
  const views_k_new = await db.updateSeasonViews();
  return { views_k_new };
}
