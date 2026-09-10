/**
 * /terms — Terms of Service.
 *
 * Florida governing law, binding arbitration + class-action waiver (with a
 * 30-day opt-out, standard for enforceability), reflecting the actual
 * product: the free "Free Climb" game, public creator profiles (username +
 * saved social handles + climbing record), chip duels (non-cashable ranked
 * play, Section 5a), and bracket tournaments with company-guaranteed cash
 * prizes (Section 5b). Doomstack currently operates as a sole proprietorship
 * (no formed entity) based in Florida, USA — see the note in privacy/page.tsx
 * if that changes.
 *
 * Chip duels and tournaments are framed as skill-based competition (not
 * gambling). Compliance controls that live in code: an 18+ *attestation*
 * (self-confirmation, not verified age — see recordAgeConfirmation /
 * age_confirmed_at), an IP-based geo allow-list (paidDuelGeo.ts, default-deny,
 * fail-closed), and a PAID_DUELS_ENABLED kill switch. The copy must not
 * overstate these (e.g. do not claim we "verify" age or location). This is
 * drafted text for human legal review, not a final legal opinion — the
 * skill-game framing, money-transmitter posture, and state list need attorney
 * sign-off.
 */

import { Navbar } from "../../src/components/Navbar";
import {
  LegalHeader,
  LegalNav,
  Section,
  SubHeading,
  List,
  MailLink,
} from "../../src/components/Legal/LegalArticle";
import { buildMetadata } from "../../src/lib/seo";

const UPDATED = "September 10, 2026";
const CONTACT_EMAIL = "hello@doomstack.lol";

export const metadata = buildMetadata({
  title: "Doomstack — Terms of Service",
  description:
    "The rules for using Doomstack, Free Climb, chip duels, and tournaments.",
  path: "/terms",
});

const TOC = [
  { id: "acceptance", label: "Acceptance of terms" },
  { id: "the-service", label: "The service" },
  { id: "eligibility", label: "Eligibility & accounts" },
  { id: "payments", label: "Payments & purchases" },
  { id: "competitive-play", label: "Competitive play: chips & tournaments" },
  { id: "acceptable-use", label: "Acceptable use" },
  { id: "content", label: "User content & profiles" },
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
    <main id="main-content" className="grain min-h-screen bg-void">
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
            guest), buying chips, entering a tournament, or otherwise using the
            Service, you agree to be bound by these Terms. If you don&apos;t
            agree, don&apos;t use the Service. If you&apos;re using the Service on
            behalf of a company or other entity, you represent that you have
            authority to bind that entity, and &ldquo;you&rdquo; refers to
            both you and that entity.
          </p>
        </Section>

        <Section id="the-service" title="2. The service">
          <p>
            Doomstack is a skill-based climbing game. <strong>Free Climb</strong>{" "}
            is a free, browser-based endless-climbing game where your peak
            height is recorded on a public leaderboard. <strong>Chip duels</strong>{" "}
            are ranked head-to-head matches where players stake non-cashable chips
            (see Section 5a). <strong>Tournaments</strong> are bracket competitions
            with a paid entry fee and predetermined cash prizes (see Section 5b).
            Rank and duel results are always computed from play — never from how
            much you spend.
          </p>
          <p>
            The Service, including gameplay formulas, is provided as a
            competitive, for-entertainment product. Participation does not create
            any ownership interest, investment, or security, and past performance
            is not a promise of future results.
          </p>
        </Section>

        <Section id="eligibility" title="3. Eligibility & accounts">
          <List>
            <li>
              You must be at least 13 years old to create an account. If
              you&apos;re under the age of majority in your jurisdiction, you may
              only use the Service with a parent or guardian&apos;s consent.
            </li>
            <li>
              You&apos;re responsible for maintaining the confidentiality of your
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
              Accounts are for individual use. Don&apos;t create accounts through
              unauthorized automated means, or sell, trade, or transfer your
              account to another person.
            </li>
          </List>
        </Section>

        <Section id="payments" title="4. Payments & purchases">
          <List>
            <li>
              All payments are processed by Stripe. By making a purchase, you
              agree to Stripe&apos;s terms in addition to ours, and you represent
              that you&apos;re authorized to use the payment method provided.
            </li>
            <li>
              Chip prices, tournament entry fees, and any applicable fees may
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
              We may cancel or reverse a transaction, and freeze or reverse the
              associated chips or entry, if we reasonably believe it was
              fraudulent, violated these Terms, or resulted from a payment
              dispute (e.g., a chargeback).
            </li>
          </List>
        </Section>

        <Section id="competitive-play" title="5. Competitive play: chips & tournaments">
          <p>
            <strong>
              Chip duels and tournaments are skill-based competitions, not gambling.
            </strong>{" "}
            A match is won by climbing the same deterministic tower faster and
            farther than your opponent: the tower each player faces is identical,
            it is generated the same way for both players, and the outcome is
            determined by the players&apos; skill and inputs — not by chance, a random
            draw, or the operator. These features are offered only where
            skill-based competition is permitted, and are not offered where
            restricted or prohibited by law. Nothing in this section is a promise
            that participation is lawful in your location; that is your
            responsibility to determine, and you agree not to participate where
            you may not lawfully do so.
          </p>

          <SubHeading>5a. Chip duels (ranked, non-cashable)</SubHeading>
          <List>
            <li>
              <strong>Chips are non-cashable virtual currency.</strong> Chips are
              a prepaid, in-app balance usable only inside the Service to stake
              on ranked 1v1 duels. Chips are{" "}
              <strong>non-refundable</strong> and{" "}
              <strong>can never be withdrawn, cashed out, converted to real
              money, or transferred</strong> to another user or any third party.
              They have no cash value outside the Service, are not a bank deposit,
              are not insured, and earn no interest. We are not a bank, money
              transmitter, or money services business. All chip sales are final.
            </li>
            <li>
              <strong>Zero-sum matches, no house cut.</strong> In a chip duel,
              both players stake the same number of chips at a fixed tier. The
              winner receives exactly the loser&apos;s stake — there is no platform
              fee or rake on chip duels.
            </li>
            <li>
              <strong>Refunds on unplayed matches.</strong> If a chip duel never
              starts (e.g. you cancel before an opponent joins, or no opponent
              joins), your staked chips are returned. Once both players have
              staked and the match begins, the result of a completed match is
              final, except as stated in &ldquo;Fair play&rdquo; below.
            </li>
            <li>
              <strong>No secondary market.</strong> Selling, trading, gifting,
              or otherwise transferring chips outside the Service — including
              via any secondary market, forum, or external arrangement — is
              strictly prohibited and may result in account termination and
              forfeiture of all chips.
            </li>
          </List>

          <SubHeading>5b. Tournaments (real-money prizes)</SubHeading>
          <List>
            <li>
              <strong>Entry fees &amp; prizes.</strong> Tournament entry fees are
              paid via Stripe Checkout. Prize amounts are predetermined and
              company-guaranteed before registration opens — they are not pooled
              or derived from entry fees. Prizes are paid to eligible winners via
              Stripe Connect.
            </li>
            <li>
              <strong>Payout &amp; identity.</strong> To receive a tournament
              prize, you must complete Stripe Connect Express onboarding, which
              may include identity and tax-information verification required by
              Stripe and applicable law. You are solely responsible for any taxes
              on prize winnings.
            </li>
            <li>
              <strong>Bracket &amp; format.</strong> Tournaments are single-
              elimination brackets. Bracket sizes, round schedules, and
              placement rules are shown before registration. Non-power-of-2
              entrant counts are padded with byes.
            </li>
            <li>
              <strong>Entry refunds.</strong> If a tournament is cancelled before
              it begins, entry fees are refunded. Once a tournament is seeded
              and play begins, entry fees are non-refundable except as required
              by law.
            </li>
          </List>

          <SubHeading>Shared rules</SubHeading>
          <List>
            <li>
              <strong>Eligibility &amp; location.</strong> You must be 18 or older
              to buy chips or enter a tournament. When you buy chips or register,
              you represent and confirm that you are at least 18 — we rely on
              your confirmation and do not independently verify your age.
              These features require your location to be specifically and
              affirmatively cleared; they are{" "}
              <strong>not currently available in any location</strong>, pending
              jurisdiction-by-jurisdiction legal review. We will publish and
              update the list of cleared jurisdictions here as any are added.
              We infer your approximate location from your IP address; this
              method is not exact. Using a VPN, proxy, or any other means to
              disguise your location is prohibited and may result in suspension
              and forfeiture of chips and prizes.
            </li>
            <li>
              <strong>Chargebacks &amp; payment disputes.</strong> Initiating a
              chargeback or payment dispute — rather than contacting us first
              at <MailLink address={CONTACT_EMAIL} /> — is a breach of these
              Terms. We may respond by suspending your account, freezing or
              reversing disputed chips or entries, and recovering amounts owed.
            </li>
            <li>
              <strong>Fair play &amp; server-authoritative results.</strong> Every
              match result is re-computed on our servers from both players&apos;
              recorded inputs, and the server&apos;s result is authoritative and
              final. Cheating, automation, botting, exploiting a defect,
              collusion, or otherwise manipulating a match voids the result and
              may forfeit chips and prizes and result in account termination.
            </li>
            <li>
              <strong>We may pause or withdraw features.</strong> We may modify,
              suspend, or discontinue chip duels, chips, tournaments, or
              related features at any time, including in a specific jurisdiction.
              If we permanently discontinue a feature, we will return unused
              purchased chips and unfulfilled tournament prizes to affected users
              by a reasonable method, except where prohibited by law or where an
              amount is subject to a fraud, dispute, or eligibility hold.
            </li>
          </List>
        </Section>

        <Section id="acceptable-use" title="6. Acceptable use">
          <p>You agree not to, and not to help anyone else:</p>
          <List>
            <li>
              Submit, link to, or promote content that is illegal, fraudulent,
              deceptive, defamatory, obscene, or infringes another person&apos;s
              rights (including intellectual property or privacy rights).
            </li>
            <li>
              Submit a destination URL that distributes malware, conducts
              phishing, or otherwise attempts to compromise a visitor&apos;s
              device or accounts.
            </li>
            <li>
              Impersonate any person or entity, or misrepresent your
              affiliation with a person or entity.
            </li>
            <li>
              Scrape, crawl, or harvest data from the Service using automated
              means beyond what&apos;s needed for normal, individual gameplay, or
              bypass rate limits, CAPTCHAs, or other technical protections.
            </li>
            <li>
              Manipulate leaderboard results, gameplay scoring, or match outcomes
              through bots, scripts, automation, or other artificial means.
            </li>
            <li>
              Save a social handle you do not own or are not authorized to
              represent, or choose a public username or handle that impersonates
              another person, brand, or the Service itself.
            </li>
            <li>
              Interfere with or disrupt the Service&apos;s infrastructure, or
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

        <Section id="content" title="7. User content & profiles">
          <p>
            &ldquo;User Content&rdquo; means anything you submit to the
            Service, including your display name, the social platform handles you
            save, and a public username you choose (which creates a public creator
            page at <code>/c/your-username</code> that shows your saved social
            handles and public climbing record). You retain ownership of your User
            Content. By submitting it, you grant Doomstack a non-exclusive,
            worldwide, royalty-free license to host, display, and distribute it
            as part of operating the public leaderboard and creator pages — for
            example, showing your name, handles, and rank to other visitors and
            in leaderboard-related images (such as social share cards).
          </p>
          <p>
            You represent that you have the rights necessary to submit your
            User Content and grant this license, and that it doesn&apos;t violate
            these Terms, any law, or any third party&apos;s rights. We may
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
            notice, if we reasonably believe you&apos;ve violated these Terms,
            created risk or legal exposure for us, engaged in fraud or abuse,
            or if we discontinue the Service. If your account is terminated,
            purchased chips are forfeited and non-refundable; outstanding
            tournament prizes will be handled as described in Section 5b.
            Sections that by their nature should survive termination
            (including Sections 5 and 7–15) will survive.
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
            WARRANT THAT BUYING CHIPS OR ENTERING A TOURNAMENT WILL RESULT IN
            ANY WINNINGS OR OTHER BENEFIT. SOME JURISDICTIONS DON&apos;T ALLOW THE
            EXCLUSION OF CERTAIN WARRANTIES, SO SOME OF THE ABOVE EXCLUSIONS MAY
            NOT APPLY TO YOU.
          </p>
        </Section>

        <Section id="liability" title="11. Limitation of liability">
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, DOOMSTACK AND ITS
            OPERATOR WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
            SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF
            PROFITS, REVENUE, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE
            SERVICE, EVEN IF WE&apos;VE BEEN ADVISED OF THE POSSIBILITY OF SUCH
            DAMAGES. OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR
            RELATING TO THE SERVICE OR THESE TERMS WILL NOT EXCEED THE
            GREATER OF (A) THE AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE THE
            CLAIM AROSE, OR (B) $100 USD. SOME JURISDICTIONS DON&apos;T ALLOW
            CERTAIN LIABILITY LIMITATIONS, SO SOME OF THE ABOVE MAY NOT APPLY
            TO YOU.
          </p>
        </Section>

        <Section id="indemnification" title="12. Indemnification">
          <p>
            You agree to defend, indemnify, and hold harmless Doomstack and
            its operator from any claims, damages, losses, liabilities, and
            expenses (including reasonable attorneys&apos; fees) arising out of or
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
            changes, we&apos;ll update the &ldquo;Last updated&rdquo; date above
            and, where appropriate, provide additional notice. Continuing to
            use the Service after changes take effect means you accept the
            updated Terms; if you don&apos;t agree, stop using the Service.
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
              provision isn&apos;t a waiver of it.
            </li>
            <li>
              <strong>Assignment.</strong> You may not assign these Terms
              without our consent; we may assign them in connection with a
              merger, acquisition, or sale of assets.
            </li>
            <li>
              <strong>Force majeure.</strong> We&apos;re not liable for delays or
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
    </main>
  );
}
