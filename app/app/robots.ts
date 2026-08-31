import type { MetadataRoute } from "next";
import { resolveBaseUrl } from "../src/config/public";
import { getRobotsConfig } from "../src/seo/robotsConfig";

export default function robots(): MetadataRoute.Robots {
  return getRobotsConfig(resolveBaseUrl());
}
