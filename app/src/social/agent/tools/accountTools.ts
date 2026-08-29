import { listSocialAccounts } from "../../../db/social/socialAccounts";

/** get_social_accounts — read-only, no input. */
export async function getSocialAccountsTool() {
  return listSocialAccounts();
}
