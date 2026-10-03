import { FREE_LIVES_THROUGH_LEVEL, LIFE_REFILL_MS, MAX_LIVES } from "@app/levels/rules";

import type { TourStep } from "./AppTour";

/**
 * The first-run tour of the level map (the home screen) and the tab bar:
 * what each readout means and where each part of the game lives. Targets are
 * `data-tour` attributes on the map and on BottomNav.
 */
export const MAP_TOUR: readonly TourStep[] = [
  {
    target: "next-level",
    title: "Your levels",
    body: "Levels climb up the map from the bottom. Clear one to open the next. Pins with a skull are Hard levels.",
  },
  {
    target: "lives",
    title: "Lives",
    body: `Levels 1 to ${FREE_LIVES_THROUGH_LEVEL} are free. After that, a lost run costs a life and a clear keeps it. You hold up to ${MAX_LIVES}, and one comes back every ${LIFE_REFILL_MS / 60_000} minutes.`,
  },
  {
    target: "xp",
    title: "XP",
    body: "First clears, stars and the Daily Climb earn XP. Fill the bar to raise your player level.",
  },
  {
    target: "chest",
    title: "Star chest",
    body: "A fast finish earns up to 3 stars. Stars fill this chest, and a full chest gives you boosters: power-ups you can start a level with.",
  },
  {
    target: "play",
    title: "Play",
    body: "Opens the next level. Pick a booster there if you have one, then tap Start.",
  },
  {
    target: "endless",
    title: "Endless",
    body: "No summit and no lives. Climb as high as you can before the lava catches you.",
  },
  {
    target: "tab-modes",
    title: "Modes",
    body: "The Daily Climb, Quick Play against other climbers, and Challenges with your friends.",
  },
  {
    target: "tab-ranks",
    title: "Ranks",
    body: "Leaderboards for the whole world or just your friends, all-time or today.",
  },
  {
    target: "tab-shop",
    title: "Shop",
    body: "Tap + next to your gems to buy a gem pack. Spend gems on character skins, or on lives when you run out.",
  },
  {
    target: "tab-profile",
    title: "Profile",
    body: "Your characters, stats and settings. Replay this tutorial any time from How to play.",
  },
];
