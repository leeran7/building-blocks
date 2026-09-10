/**
 * /terms — Terms of Service.
 *
 * Florida governing law, binding arbitration + class-action waiver (with a
 * 30-day opt-out, standard for enforceability), reflecting the actual
 * product: free "Free Climb" game, paid leaderboard "Stacks" purchased via
 * Stripe Checkout, public block submissions, and paid 1v1 duels backed by a
 * prepaid credits wallet (Section 5). Doomstack currently operates as a sole
 * proprietorship (no formed entity) based in Florida, USA — see the note in
 * privacy/page.tsx if that changes.
 *
 * Paid duels are framed as skill-based competition (not gambling). Compliance
 * controls that live in code: an 18+ *attestation* (self-confirmation, not
 * verified age — see recordAgeConfirmation / age_confirmed_at), an IP-based
 * geoblock of AZ/IA/LA/MT/WA (paidDuelGeo.ts, region-level and fail-closed),
 * and a PAID_DUELS_ENABLED kill switch. The copy must not overstate these
 * (e.g. do not claim we "verify" age or location). This is drafted text for
 * human legal review, not a final legal opinion — the skill-game framing,
 * money-transmitter posture, and state list need attorney sign-off.
 */

import { Navbar } from "../../src/components/Navbar";
import { Footer } from "../../src/components/LandingPage/Footer";
import {
  LegalHeader,
  LegalNav,
  Section,
  SubHeading,
  List,
  MailLink,
} from "../../src/components/Legal/LegalArticle";
import { buildMetadata } from "../../src/lib/seo";

const UPDATED = "September 9, 2026";
const CONTACT_EMAIL = "hello@doomstack.lol";

export const metadata = buildMetadata({
  title: "Doomstack — Terms of Service",
  description:
    "The rules for using Doomstack, Free Climb, paid Stacks, and paid 1v1 duels.",
  path: "/terms",
});

const TOC = [
  { id: "acceptance", label: "Acceptance of terms" },
  { id: "the-service", label: "The service" },
  { id: "eligibility", label: "Eligibility & accounts" },
  { id: "payments", label: "Payments & purchases" },
  { id: "paid-duels", label: "Paid 1v1 duels & credits" },
  { id: "acceptable-use", label: "Acceptable use" },
  { id: "content", label: "User content & submissions" },
  { id: "ip", label: "Intellectual property" },
  { id: "termination", label: "Termination & suspension" },
  { id: "disclaimer", label: "Disclaimer of warranties" },
  { id: "liability", label: "Limitation of liability" },
  { id: "indemnification", label: "Indemnification" },
  { id: "disputes", label: "Governing law & disputes" },
  { id: "changes", label: "Changes to these terms" },
  { id: "misc", label: "General terms" },
  { id: "contact", label: "Contact us" },
] as const;

export default function TermsPage() {
  return (
    <main id="main-content" className="min-h-screen bg-void">
      <Navbar contextLabel="Terms" />

      <div className="max-w-2xl mx-auto px-4 py-12">
        <LegalHeader eyebrow="Legal" title="Terms of Service" updated={UPDATED} />

        <p className="text-sm leading-relaxed text-text-secondary mb-8">
          These Terms of Service (&ldquo;<strong>Terms</strong>&rdquo;) are a
          binding agreement between you and Doomstack (&ldquo;
          <strong>Doomstack</strong>,&rdquo; &ldquo;<strong>we</strong>,
          &rdquo; &ldquo;<strong>us</strong>&rdquo;), currently operated as a
          sole proprietorship based in Florida, USA, governing your use of
          doomstack.lol and the Doomstack app (the &ldquo;
          <strong>Service</strong>&rdquo;). Please also read our{" "}
          <a href="/privacy" className="text-signal hover:underline">
            Privacy Policy
          </a>
          , which explains how we handle your information.
        </p>

        <LegalNav items={TOC} />

        <Section id="acceptance" title="1. Acceptance of terms">
          <p>
            By creating an account, playing Free Climb (including as a
            guest), purchasing a spot on a Stack, or otherwise using the
            Service, you agree to be bound by these Terms. If you don’t
            agree, don’t use the Service. If you’re using the Service on
            behalf of a company or other entity, you represent that you have
            authority to bind that entity, and &ldquo;you&rdquo; refers to
            both you and that entity.
          </p>
        </Section>

        <Section id="the-service" title="2. The service">
          <p>
            Doomstack is a leaderboard game. <strong>Free Climb</strong> is a
            free, browser-based endless-climbing game where your peak
            altitude per category is recorded permanently on a public
            leaderboard. <strong>Stacks</strong> are paid leaderboards where
            you can submit a link (a &ldquo;block&rdquo;) and pay, via Stripe
            Checkout, to raise its position. As described on the Service,
            the cost to claim or hold a given rank can change over time
            (for example, based on views a block receives), and rank is
            always computed from the current leaderboard state at the time
            you view it — we don’t promise a rank will stay fixed after
            purchase.
          </p>
          <p>
            The Service, including gameplay formulas, is provided as a
            competitive, for-entertainment product. Buying a block does not
            create any ownership interest, guaranteed traffic, guaranteed
            revenue, investment, or security, and past leaderboard
            performance is not a promise of future results.
          </p>
        </Section>

        <Section id="eligibility" title="3. Eligibility & accounts">
          <List>
            <li>
              You must be at least 13 years old to create an account. If
              you’re under the age of majority in your jurisdiction, you may
              only use the Service with a parent or guardian’s consent.
            </li>
            <li>
              You’re responsible for maintaining the confidentiality of your
              account credentials and for all activity under your account.
              Notify us promptly at <MailLink address={CONTACT_EMAIL} /> if
              you suspect unauthorized use.
            </li>
            <li>
              You agree to provide accurate information (such as a working
              email address) and to keep it up to date.
            </li>
            <li>
              You may play Free Climb anonymously as a guest without an
              account; guest sessions are temporary and are not guaranteed
              to persist or be recoverable.
            </li>
            <li>
              Accounts are for individual use. Don’t create accounts through
              unauthorized automated means, or sell, trade, or transfer your
              account to another person.
            </li>
          </List>
        </Section>

        <Section id="payments" title="4. Payments & purchases">
          <List>
            <li>
              All payments are processed by Stripe. By making a purchase, you
              agree to Stripe’s terms in addition to ours, and you represent
              that you’re authorized to use the payment method provided.
            </li>
            <li>
              Prices and the cost to claim or hold a leaderboard position may
              change at any time and are shown to you before you complete a
              purchase.
            </li>
            <li>
              <strong>All purchases are final and non-refundable</strong>,
              except where required by applicable law or at our sole
              discretion (for example, a duplicate or clearly erroneous
              charge). If you believe you were charged in error, contact{" "}
              <MailLink address={CONTACT_EMAIL} /> within 30 days of the
              charge.
            </li>
            <li>
              We may cancel or reverse a transaction and remove a block if we
              reasonably believe it was fraudulent, violated these Terms, or
              resulted from a payment dispute (e.g., a chargeback).
            </li>
          </List>
        </Section>

        <Section id="paid-duels" title="5. Paid 1v1 duels & credits">
          <p>
            <strong>
              Paid 1v1 duels are skill-based competitions, not gambling.
            </strong>{" "}
            A duel is won by climbing the same deterministic tower faster and
            farther than your opponent: the tower each player faces is identical,
            it is generated the same way for both players, and the outcome is
            determined by the players’ skill and inputs — not by chance, a random
            draw, or the operator. This feature is offered only where staking on a
            skill-based competition is permitted, and it is not offered where it is
            restricted or prohibited by law. Nothing in this section is a promise
            that participation is lawful in your location; that is your
            responsibility to determine, and you agree not to participate where you
            may not lawfully do so.
          </p>
          <List>
            <li>
              <strong>Eligibility &amp; location.</strong> You must be 18 or older
              and physically located outside the restricted states to buy credits
              or enter a paid duel. When you buy credits or stake, you represent and
              confirm that you are at least 18 — we rely on your confirmation and do
              not independently verify your age at that step. Paid duels are{" "}
              <strong>not available</strong> in Arizona, Iowa, Louisiana, Montana,
              or Washington. We infer your approximate location from your IP address
              to enforce this and may block or deny access; this method is not exact.
              Using a VPN, proxy, or any other means to disguise your location or
              circumvent these controls is prohibited and may result in suspension
              and forfeiture of credits and winnings.
            </li>
            <li>
              <strong>Credits are stored value for play only — not a deposit
              account.</strong> Credits are a prepaid, in-app balance
              (1 credit = US$0.01) usable only inside the Service to enter paid
              duels. Purchased credits are <strong>play credits</strong>: they are{" "}
              <strong>non-refundable</strong> and{" "}
              <strong>cannot be withdrawn, cashed out, or transferred</strong> to
              you, to another user, or to anyone else. They have no cash value
              outside the Service, are not a bank deposit, are not insured, and earn
              no interest. We are not a bank, money transmitter, or money services
              business, and credits are not a stored-value instrument you can redeem
              for cash. See “Payments &amp; purchases” above; all sales of credits
              are final.
            </li>
            <li>
              <strong>Staking &amp; the pot.</strong> Entering or joining a paid
              duel debits your stake from your balance and holds it while the match
              is set up and played. Stakes are fixed tiers shown before you commit.
              When a match resolves, the winner receives the combined pot (both
              players’ stakes) minus a <strong>platform fee of 10%</strong> of the
              pot, credited to the winner as <strong>winnings</strong>. The platform
              fee is retained by us as compensation for operating the competition
              and is non-refundable.
            </li>
            <li>
              <strong>Winnings &amp; cash-out.</strong> Only your winnings balance is
              cashable; purchased play credits never are. Cash-out requests are
              subject to a stated minimum, are reviewed and processed manually, may
              take time, and may require identity, age, or eligibility verification
              (including information needed to comply with tax and anti-fraud
              obligations) before we release funds. You are solely responsible for
              any taxes on winnings. We may hold, delay, reduce, or decline a payout,
              and may reverse credited winnings, where we reasonably believe it
              results from fraud, collusion, multi-accounting, cheating, a payment
              dispute or chargeback, a violation of these Terms, or where required to
              comply with law.
            </li>
            <li>
              <strong>When stakes are committed, and when they are refunded.</strong>{" "}
              If a duel never starts — for example, you cancel a challenge before an
              opponent joins, or no opponent stakes and joins — your stake is
              returned to the same balance (play or winnings) it was drawn from. Once
              both players have staked and the match begins, the stake is committed
              and the result of a completed match is final, except as stated in
              “Fair play” below or as required by law.
            </li>
            <li>
              <strong>Chargebacks &amp; payment disputes.</strong> Because credits
              are consumed in play and are non-refundable, initiating a chargeback or
              payment dispute on a credit purchase — rather than contacting us first
              at <MailLink address={CONTACT_EMAIL} /> — is a breach of these Terms.
              We may respond to a chargeback by suspending your account, freezing or
              reversing the disputed credits and any winnings derived from them, and
              recovering amounts owed, without limiting our other remedies.
            </li>
            <li>
              <strong>Fair play &amp; server-authoritative results.</strong> Every
              duel result is re-computed on our servers from both players’ recorded
              inputs, and the server’s result is authoritative and final. Cheating,
              automation, botting, exploiting a defect, collusion, or otherwise
              manipulating a match voids the result and may forfeit the stakes and
              any winnings involved and result in account termination.
            </li>
            <li>
              <strong>We may pause or withdraw the feature.</strong> We may modify,
              suspend, or discontinue paid duels, credits, or cash-out at any time,
              including in a specific jurisdiction. If we permanently discontinue the
              feature, we will return unused purchased credits and cashable winnings
              to affected users by a reasonable method, except where prohibited by
              law or where an amount is subject to a fraud, dispute, or eligibility
              hold.
            </li>
          </List>
        </Section>

        <Section id="acceptable-use" title="6. Acceptable use">
          <p>You agree not to, and not to help anyone else:</p>
          <List>
            <li>
              Submit, link to, or promote content that is illegal, fraudulent,
              deceptive, defamatory, obscene, or infringes another person’s
              rights (including intellectual property or privacy rights).
            </li>
            <li>
              Submit a destination URL that distributes malware, conducts
              phishing, or otherwise attempts to compromise a visitor’s
              device or accounts.
            </li>
            <li>
              Impersonate any person or entity, or misrepresent your
              affiliation with a person or entity.
            </li>
            <li>
              Scrape, crawl, or harvest data from the Service using automated
              means beyond what’s needed for normal, individual gameplay, or
              bypass rate limits, CAPTCHAs, or other technical protections.
            </li>
            <li>
              Manipulate leaderboard results, gameplay scoring, or view/click
              counts through bots, scripts, click farms, or other artificial
              means.
            </li>
            <li>
              Offer players any reward, incentive, or compensation in exchange
              for following, subscribing to, or engaging with a linked social
              account. Listings that point at a social profile (TikTok, X,
              YouTube, Instagram, or Twitch) must rely on genuine, organic
              discovery. Incentivized engagement violates those platforms’ own
              terms and is not allowed here.
            </li>
            <li>
              Link to a social account you do not own or are not authorized to
              promote, or choose a public username or handle that impersonates
              another person, brand, or the Service itself.
            </li>
            <li>
              Interfere with or disrupt the Service’s infrastructure, or
              attempt to gain unauthorized access to any account, system, or
              network connected to it.
            </li>
            <li>
              Use the Service to violate any applicable law or regulation.
            </li>
          </List>
          <p>
            We may investigate and take appropriate action for violations,
            including removing content, suspending or terminating accounts,
            and reporting conduct to law enforcement.
          </p>
        </Section>

        <Section id="content" title="7. User content & submissions">
          <p>
            &ldquo;User Content&rdquo; means anything you submit to the
            Service, including a block’s display name and destination URL, the
            social platform and handle a listing points at, and a public
            username you choose (which creates a public creator page at{" "}
            <code>/c/your-username</code> that aggregates your visible listings
            and public climbing record). You retain ownership of your User
            Content. By submitting it, you grant Doomstack a non-exclusive,
            worldwide, royalty-free license to host, display, and distribute it
            as part of operating the public leaderboard and creator pages — for
            example, showing your block’s name, handle, and rank to other
            visitors and in leaderboard-related images (such as social share
            cards). When a visitor clicks your listing, we route them through a
            tracked link that counts the click before forwarding them to your
            destination.
          </p>
          <p>
            You represent that you have the rights necessary to submit your
            User Content and grant this license, and that it doesn’t violate
            these Terms, any law, or any third party’s rights. We may
            remove, hide, or refuse any User Content at our discretion,
            including without a refund if it violates Section 6 (Acceptable
            Use).
          </p>
        </Section>

        <Section id="ip" title="8. Intellectual property">
          <p>
            The Service — including its code, game mechanics, design,
            graphics, the Doomstack name and logo, and all related
            intellectual property (excluding your User Content) — is owned
            by Doomstack or its licensors and is protected by copyright,
            trademark, and other laws. We grant you a limited,
            non-exclusive, non-transferable, revocable license to access and
            use the Service for its intended purpose. You may not copy,
            modify, reverse-engineer, or create derivative works from the
            Service except as permitted by law, nor use our name or logo
            without permission.
          </p>
        </Section>

        <Section id="termination" title="9. Termination & suspension">
          <p>
            You may stop using the Service, or request account deletion, at
            any time by contacting <MailLink address={CONTACT_EMAIL} />. We
            may suspend or terminate your access to the Service, remove
            content, or restrict features at any time, with or without
            notice, if we reasonably believe you’ve violated these Terms,
            created risk or legal exposure for us, engaged in fraud or abuse,
            or if we discontinue the Service. If your account is terminated,
            purchased play credits are forfeited and non-refundable; we will
            return cashable winnings not subject to a fraud, dispute, or
            eligibility hold, except where you were terminated for a violation
            of these Terms or where prohibited by law. Sections that by their
            nature should survive termination (including Sections 5 and 7–15)
            will survive.
          </p>
        </Section>

        <Section id="disclaimer" title="10. Disclaimer of warranties">
          <p className="uppercase text-xs tracking-wide text-text-muted">
            Please read this section carefully
          </p>
          <p>
            THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
            AVAILABLE,&rdquo; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS,
            IMPLIED, OR STATUTORY, INCLUDING WARRANTIES OF MERCHANTABILITY,
            FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR THAT THE
            SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE. WE DO NOT
            WARRANT THAT PURCHASING A LEADERBOARD POSITION WILL RESULT IN ANY
            PARTICULAR AMOUNT OF TRAFFIC, VIEWS, OR OTHER BENEFIT. SOME
            JURISDICTIONS DON’T ALLOW THE EXCLUSION OF CERTAIN WARRANTIES, SO
            SOME OF THE ABOVE EXCLUSIONS MAY NOT APPLY TO YOU.
          </p>
        </Section>

        <Section id="liability" title="11. Limitation of liability">
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, DOOMSTACK AND ITS
            OPERATOR WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
            SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF
            PROFITS, REVENUE, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE
            SERVICE, EVEN IF WE’VE BEEN ADVISED OF THE POSSIBILITY OF SUCH
            DAMAGES. OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR
            RELATING TO THE SERVICE OR THESE TERMS WILL NOT EXCEED THE
            GREATER OF (A) THE AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE THE
            CLAIM AROSE, OR (B) $100 USD. SOME JURISDICTIONS DON’T ALLOW
            CERTAIN LIABILITY LIMITATIONS, SO SOME OF THE ABOVE MAY NOT APPLY
            TO YOU.
          </p>
        </Section>

        <Section id="indemnification" title="12. Indemnification">
          <p>
            You agree to defend, indemnify, and hold harmless Doomstack and
            its operator from any claims, damages, losses, liabilities, and
            expenses (including reasonable attorneys’ fees) arising out of or
            related to: your use of the Service; your User Content; your
            violation of these Terms; or your violation of any law or
            third-party right.
          </p>
        </Section>

        <Section id="disputes" title="13. Governing law & dispute resolution">
          <SubHeading>Governing law</SubHeading>
          <p>
            These Terms are governed by the laws of the State of Florida,
            USA, without regard to its conflict-of-laws rules.
          </p>
          <SubHeading>Binding arbitration & class action waiver</SubHeading>
          <p>
            You and Doomstack agree to resolve any dispute arising out of or
            relating to these Terms or the Service through final, binding
            arbitration, rather than in court, except that either party may
            bring an individual claim in small claims court, and either
            party may seek injunctive or other equitable relief in court to
            prevent misuse of intellectual property or unauthorized access
            to the Service. Arbitration will be administered by a recognized
            arbitration provider (such as the American Arbitration
            Association) under its consumer arbitration rules, and will take
            place in, or be conducted remotely consistent with the law of,
            Florida.
          </p>
          <p>
            <strong>Class action waiver:</strong> You and Doomstack agree
            that any proceeding to resolve a dispute will be conducted only
            on an individual basis, and not as a class, consolidated, or
            representative action. If this class action waiver is found
            unenforceable as to a particular claim or remedy, that claim or
            remedy (and only that one) will proceed in court, and the rest of
            this arbitration section will still apply to the remainder.
          </p>
          <p>
            <strong>Opt-out:</strong> You may opt out of this arbitration
            agreement by emailing <MailLink address={CONTACT_EMAIL} /> within
            30 days of first agreeing to these Terms, with your name and a
            clear statement that you wish to opt out of arbitration. If you
            opt out, disputes will instead be resolved exclusively in the
            state or federal courts located in Florida, and you and Doomstack
            each waive any right to a jury trial.
          </p>
        </Section>

        <Section id="changes" title="14. Changes to these terms">
          <p>
            We may update these Terms from time to time. If we make material
            changes, we’ll update the &ldquo;Last updated&rdquo; date above
            and, where appropriate, provide additional notice. Continuing to
            use the Service after changes take effect means you accept the
            updated Terms; if you don’t agree, stop using the Service.
          </p>
        </Section>

        <Section id="misc" title="15. General terms">
          <List>
            <li>
              <strong>Entire agreement.</strong> These Terms and our Privacy
              Policy are the entire agreement between you and Doomstack
              regarding the Service, and supersede any prior agreements on
              this subject.
            </li>
            <li>
              <strong>Severability.</strong> If any provision of these Terms
              is found unenforceable, the rest will remain in full effect.
            </li>
            <li>
              <strong>No waiver.</strong> Our failure to enforce a right or
              provision isn’t a waiver of it.
            </li>
            <li>
              <strong>Assignment.</strong> You may not assign these Terms
              without our consent; we may assign them in connection with a
              merger, acquisition, or sale of assets.
            </li>
            <li>
              <strong>Force majeure.</strong> We’re not liable for delays or
              failures caused by events outside our reasonable control.
            </li>
          </List>
        </Section>

        <Section id="contact" title="16. Contact us">
          <p>
            Questions about these Terms? Reach us at{" "}
            <MailLink address={CONTACT_EMAIL} />.
          </p>
        </Section>
      </div>

      <Footer />
    </main>
  );
}
