import { getBrandProfile } from "../../../db/social/brandProfile";

/** get_brand_profile — read-only, no input. */
export async function getBrandProfileTool() {
  const profile = await getBrandProfile();
  return profile ?? { message: "No brand profile has been configured yet." };
}
