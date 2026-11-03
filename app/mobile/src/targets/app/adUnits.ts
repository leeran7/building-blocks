/**
 * AdMob ad units for the iOS app. Not secrets: they ship in every build.
 *
 * Empty means "no live ads yet": a production build then serves none, and a
 * dev build uses Google's public test units so the flow can be tried. Fill
 * these in from the AdMob console (Apps > Doomstack > Ad units) together
 * with GADApplicationIdentifier in ios/App/App/Info.plist.
 */
export const ADMOB_IOS_UNITS = {
  /** Interstitial before Endless "Play again" (placement A). */
  interstitial: "",
  /** Rewarded "+1 life" when out of lives (placement B). */
  rewarded: "",
};

/** Google's public iOS test units: they always fill and never pay. */
export const ADMOB_IOS_TEST_UNITS = {
  interstitial: "ca-app-pub-3940256099942544/4411468910",
  rewarded: "ca-app-pub-3940256099942544/1712485313",
};
