import type { Metadata } from "next";
import { Suspense } from "react";
import { PayoutPage } from "../../../src/components/Account/PayoutPage";
import { buildMetadata } from "../../../src/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Payouts — The Climb",
  description: "Tournament prize payouts.",
  path: "/account/payout",
});

export default function AccountPayoutPage() {
  return (
    <Suspense fallback={null}>
      <PayoutPage />
    </Suspense>
  );
}
