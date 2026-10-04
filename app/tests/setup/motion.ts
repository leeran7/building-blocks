/**
 * Motion (motion.dev) animations finish at once in tests: happy-dom has no
 * real frame clock, so exits would linger and cancelled animations reject.
 * A test that checks the in-between state turns this off for itself.
 */
import { MotionGlobalConfig } from "motion";

MotionGlobalConfig.skipAnimations = true;
