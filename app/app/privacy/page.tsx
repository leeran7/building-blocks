/**
 * /privacy — Privacy Policy.
 *
 * Reflects the actual data flows in this codebase: Firebase Auth (email/password
 * + Google OAuth + anonymous guest sessions), Stripe Checkout for paid leaderboard
 * blocks, Postgres/Prisma for storage, Upstash Redis for caching/rate-limiting,
 * Vercel hosting, and an OpenAI-backed social media agent (internal/business use,
 * not applied to end-user personal data). Doomstack currently operates as a sole
 * proprietorship (no formed entity) based in Florida, USA — update the operator
 * name in CONTACT_EMAIL/entity references below if/when that changes.
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

const UPDATED = "September 4, 2026";
const CONTACT_EMAIL = "hello@doomstack.lol";

export const metadata = buildMetadata({
  title: "Doomstack — Privacy Policy",
  description:
    "How Doomstack collects, uses, shares, and protects your information.",
  path: "/privacy",
});

const TOC = [
  { id: "who-we-are", label: "Who we are" },
  { id: "information-we-collect", label: "Information we collect" },
  { id: "how-we-use", label: "How we use information" },
  { id: "sharing", label: "Sharing & disclosure" },
  { id: "cookies", label: "Cookies & tracking" },
  { id: "security", label: "Data security" },
  { id: "transfers", label: "International transfers" },
  { id: "retention", label: "Data retention" },
  { id: "rights", label: "Your rights" },
  { id: "children", label: "Children’s privacy" },
  { id: "changes", label: "Changes to this policy" },
  { id: "contact", label: "Contact us" },
];

export default function PrivacyPage() {
  return (
    <main id="main-content" className="min-h-screen bg-void">
      <Navbar contextLabel="Privacy" />

      <div className="max-w-2xl mx-auto px-4 py-12">
        <LegalHeader
          eyebrow="Legal"
          title="Privacy Policy"
          updated={UPDATED}
        />

        <p className="text-sm leading-relaxed text-text-secondary mb-8">
          Doomstack (&ldquo;<strong>Doomstack</strong>,&rdquo; &ldquo;
          <strong>we</strong>,&rdquo; &ldquo;<strong>us</strong>,&rdquo; or
          &ldquo;<strong>our</strong>&rdquo;) is currently operated as a sole
          proprietorship based in Florida, USA. This Privacy Policy explains
          what personal information we collect through doomstack.lol and the
          Doomstack app (the &ldquo;Service&rdquo;), why we collect it, who we
          share it with, and the choices and rights you have. It’s written to
          work alongside the EU/UK General Data Protection Regulation
          (GDPR), the California Consumer Privacy Act as amended by the CPRA
          (CCPA/CPRA), and comparable US state privacy laws. By using the
          Service, you agree to the collection and use of information as
          described here.
        </p>

        <LegalNav items={TOC} />

        <Section id="who-we-are" title="1. Who we are">
          <p>
            Doomstack is a leaderboard game: a free endless-climbing game
            (&ldquo;Free Climb&rdquo;) plus paid leaderboards (&ldquo;
            Stacks&rdquo;) where anyone can submit a link and buy their way up
            a public ranking. We are the &ldquo;data controller&rdquo; (GDPR)
            or &ldquo;business&rdquo; (CCPA/CPRA) responsible for the personal
            information described in this policy. If we form a corporate
            entity to hold the Doomstack business, this policy will be
            updated to name it as the operator without otherwise narrowing
            your rights.
          </p>
        </Section>

        <Section id="information-we-collect" title="2. Information we collect">
          <SubHeading>Information you give us directly</SubHeading>
          <List>
            <li>
              <strong>Account information</strong> — email address, and if
              you set one, a display name. If you sign up with a password, it
              is created and verified through Firebase Authentication; we
              never see or store your plaintext password.
            </li>
            <li>
              <strong>Google sign-in</strong> — if you continue with Google,
              we receive your name, email address, and profile photo from
              Google as part of the OAuth flow.
            </li>
            <li>
              <strong>Guest play</strong> — you can play Free Climb without an
              account via anonymous authentication. This creates a temporary,
              unlinked identifier with no email or personal profile attached.
            </li>
            <li>
              <strong>Leaderboard submissions (&ldquo;blocks&rdquo;)</strong>{" "}
              — if you buy a spot on a paid Stack, we collect the destination
              URL, display name, and owner email you submit. These fields are
              shown publicly as part of the leaderboard — see{" "}
              <a href="#sharing" className="text-signal hover:underline">
                Sharing &amp; disclosure
              </a>
              .
            </li>
            <li>
              <strong>Payment information</strong> — payments are handled by
              Stripe. We receive confirmation that a payment succeeded, the
              amount, and a Stripe transaction/session identifier. We never
              receive or store your full card number, CVC, or bank details —
              those go directly to Stripe.
            </li>
            <li>
              <strong>Correspondence</strong> — if you email us or contact
              support, we keep that correspondence and any information you
              choose to include in it.
            </li>
          </List>

          <SubHeading>Information collected automatically</SubHeading>
          <List>
            <li>
              <strong>Gameplay data</strong> — climb runs, peak
              altitude/height reached per category, and (for ranked runs) a
              replay token used to verify results.
            </li>
            <li>
              <strong>Device &amp; usage data</strong> — IP address, browser
              and device type, pages and features used, timestamps, and
              general (city/region-level) location inferred from IP address,
              collected via server logs and our hosting/CDN provider.
            </li>
            <li>
              <strong>Session &amp; security identifiers</strong> — an
              authentication session cookie issued by Firebase, and
              rate-limiting counters (e.g., requests per IP) used to prevent
              abuse.
            </li>
          </List>

          <SubHeading>Information from third parties</SubHeading>
          <p>
            Beyond Google/Firebase (sign-in) and Stripe (payment
            confirmation) described above, we do not purchase or receive
            personal information about you from data brokers or advertising
            networks.
          </p>
        </Section>

        <Section id="how-we-use" title="3. How we use information">
          <List>
            <li>Create and secure your account, and authenticate sign-in.</li>
            <li>
              Operate the Service: run gameplay, compute and display
              leaderboard rankings, and process paid Stack purchases.
            </li>
            <li>
              Process payments and prevent fraudulent or duplicate
              transactions.
            </li>
            <li>
              Send transactional communications: email verification, password
              resets, and purchase confirmations.
            </li>
            <li>
              Maintain security, detect and prevent abuse, and enforce our{" "}
              <a href="/terms" className="text-signal hover:underline">
                Terms of Service
              </a>
              .
            </li>
            <li>
              Understand and improve the Service — e.g., which categories or
              features are used, and where errors occur.
            </li>
            <li>
              Comply with legal obligations (tax, accounting, and responding
              to lawful requests).
            </li>
          </List>
          <p>
            We do not use your account email or gameplay data for
            third-party advertising, and we do not build advertising profiles
            about you. If we ever add optional marketing emails, they will be
            opt-in (or you’ll be able to opt out with one click), separate
            from transactional emails you can’t opt out of while your account
            is active.
          </p>
        </Section>

        <Section id="sharing" title="4. Sharing & disclosure">
          <p>
            <strong>We do not sell your personal information</strong>, and we
            do not share it for cross-context behavioral advertising. We
            disclose personal information only in the following
            circumstances:
          </p>
          <SubHeading>Public by design</SubHeading>
          <p>
            Doomstack’s leaderboards are public. A block’s display name,
            destination URL, category, altitude/rank, and (for the free
            climb board) your chosen display name are visible to anyone who
            visits the Service — that’s the product. Do not submit
            information in these fields that you don’t want to be public.
            Your account email and owner email associated with a block are
            <em> not</em> displayed publicly.
          </p>
          <SubHeading>Service providers</SubHeading>
          <p>
            We share information with vendors who process it on our behalf,
            under contract, and only as needed to provide the Service:
          </p>
          <List>
            <li>
              <strong>Firebase / Google Cloud</strong> — authentication and
              identity.
            </li>
            <li>
              <strong>Stripe</strong> — payment processing (PCI-DSS
              compliant).
            </li>
            <li>
              <strong>Vercel</strong> — application hosting and content
              delivery.
            </li>
            <li>
              <strong>Neon (Postgres) / Prisma</strong> — database storage.
            </li>
            <li>
              <strong>Upstash</strong> — Redis caching and rate-limiting.
            </li>
            <li>
              <strong>OpenAI</strong> — powers an internal AI agent we use to
              help draft and manage our own social media presence. This
              processes content about the product and publicly available
              information; it is not used to profile or make decisions about
              individual users.
            </li>
          </List>
          <SubHeading>Legal &amp; safety</SubHeading>
          <p>
            We may disclose information if required by law, subpoena, or
            court order, or if we believe in good faith it’s necessary to
            protect the rights, property, or safety of Doomstack, our users,
            or the public.
          </p>
          <SubHeading>Business transfers</SubHeading>
          <p>
            If Doomstack is involved in a merger, acquisition, financing, or
            sale of assets, personal information may be transferred as part
            of that transaction. We’ll provide notice before your information
            becomes subject to a different privacy policy.
          </p>
        </Section>

        <Section id="cookies" title="5. Cookies & tracking technologies">
          <p>
            We use a small number of cookies and similar technologies:
          </p>
          <List>
            <li>
              <strong>Essential</strong> — an authentication session cookie
              (Firebase) that keeps you signed in. The Service can’t function
              without this.
            </li>
            <li>
              <strong>Functional</strong> — local storage used to remember
              preferences (e.g., a previously entered URL) on your device.
            </li>
          </List>
          <p>
            We don’t currently use third-party advertising or cross-site
            tracking cookies. If that changes, we’ll update this section and,
            where required, request your consent first. Most browsers let you
            block or delete cookies in their settings; doing so may prevent
            you from staying signed in.
          </p>
        </Section>

        <Section id="security" title="6. Data security">
          <p>
            We use administrative and technical safeguards designed to
            protect your information, including: encryption in transit
            (TLS/HTTPS) for all traffic to the Service; credential handling
            delegated to Firebase Authentication rather than storing
            passwords ourselves; PCI-DSS-compliant payment processing via
            Stripe, so full card data never reaches our servers; and
            access controls limiting who can reach production data. No
            method of transmission or storage is 100% secure, and we cannot
            guarantee absolute security. If we become aware of a breach
            affecting your personal information, we will notify you and
            relevant authorities as required by applicable law.
          </p>
        </Section>

        <Section id="transfers" title="7. International data transfers">
          <p>
            We’re based in the United States, and our service providers
            (Vercel, Firebase/Google Cloud, Stripe, Neon, Upstash, OpenAI)
            process data in the US and, in some cases, other countries where
            they operate infrastructure. If you’re located in the European
            Economic Area, the UK, or Switzerland, your information will be
            transferred outside of those regions. Where required, we rely on
            our providers’ own compliance mechanisms for cross-border
            transfers (such as Standard Contractual Clauses) to protect that
            data. Contact us if you’d like more information about a
            specific transfer.
          </p>
        </Section>

        <Section id="retention" title="8. Data retention">
          <p>
            We keep account information for as long as your account is
            active, plus a reasonable period afterward in case you return or
            to resolve disputes, and as needed to meet legal, tax, or
            accounting obligations (typically up to 7 years for financial
            records related to payments).
          </p>
          <p>
            Leaderboard altitude is, by design, a permanent record — that’s
            the core mechanic of the game. If you delete your account, we
            will delete or de-identify your personal information (email,
            display name), but historical leaderboard rank/altitude data may
            be retained in de-identified or aggregated form as part of the
            Service’s competitive record. Public block content you purchased
            (URL, display name) may also remain visible on a leaderboard
            after account deletion unless you separately request its
            removal, since it was purchased and published as a product
            feature, not merely stored as account data.
          </p>
        </Section>

        <Section id="rights" title="9. Your rights">
          <p>
            Depending on where you live, you may have the right to: access
            the personal information we hold about you; correct inaccurate
            information; delete your information; receive a portable copy of
            it; restrict or object to certain processing; and, under
            CCPA/CPRA, to know, delete, correct, and opt out of the sale or
            &ldquo;sharing&rdquo; of personal information (we don’t sell or
            share it for advertising, so there’s nothing to opt out of
            today) and to non-discrimination for exercising these rights.
          </p>
          <p>
            To exercise any of these rights, email us at{" "}
            <MailLink address={CONTACT_EMAIL} /> from the email address on
            your account (or provide enough information for us to verify
            your identity). We’ll respond within the time required by
            applicable law — generally within 30 days (GDPR) or 45 days
            (CCPA/CPRA). You may also designate an authorized agent to make a
            request on your behalf. If you’re in the EEA, UK, or Switzerland,
            you also have the right to lodge a complaint with your local data
            protection authority.
          </p>
        </Section>

        <Section id="children" title="10. Children’s privacy">
          <p>
            The Service is not directed to children under 13, and we do not
            knowingly collect personal information from children under 13, in
            accordance with the Children’s Online Privacy Protection Act
            (COPPA). If you believe a child under 13 has provided us with
            personal information, please contact us at{" "}
            <MailLink address={CONTACT_EMAIL} /> and we will delete it.
          </p>
        </Section>

        <Section id="changes" title="11. Changes to this policy">
          <p>
            We may update this Privacy Policy from time to time. If we make
            material changes, we’ll update the &ldquo;Last updated&rdquo;
            date above and, where appropriate, provide additional notice
            (such as an in-app notice or email). Continued use of the Service
            after a change takes effect means you accept the updated policy.
          </p>
        </Section>

        <Section id="contact" title="12. Contact us">
          <p>
            Questions, requests, or concerns about this policy or your
            personal information? Reach us at{" "}
            <MailLink address={CONTACT_EMAIL} />.
          </p>
        </Section>
      </div>

      <Footer />
    </main>
  );
}
