import type { Metadata } from "next";
import LegalShell, {
  LegalLink,
  LegalList,
  LegalP,
  type LegalSection,
} from "@/components/legal-shell";
import { SITE } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE.brandName} collects, uses and protects your personal and payment information when you book a class, trial session or personal training.`,
};

const sections: LegalSection[] = [
  {
    id: "summary",
    heading: "1. In short",
    body: (
      <>
        <LegalP>
          Booking a session with us means we have to hold your name, contact
          details and the details of what you booked. We use that only to run
          your booking, take payment, contact you about your sessions and
          support you.
        </LegalP>
        <LegalP>
          Your card or UPI credentials are entered on your payment
          provider&rsquo;s own secure page. We never see or store them — we keep
          only the transaction reference the provider gives us.
        </LegalP>
        <LegalP>
          This policy explains this in full. It applies to{" "}
          {SITE.legalEntity.name} and to {SITE.brandName} as a trading name.
        </LegalP>
      </>
    ),
  },
  {
    id: "who",
    heading: "2. Who is responsible for your information",
    body: (
      <>
        <LegalP>
          The organisation that collects and holds your information is{" "}
          <strong className="font-semibold text-fg">
            {SITE.legalEntity.name}
          </strong>{" "}
          (GSTIN {SITE.legalEntity.gstin}), operating as {SITE.brandName}.
        </LegalP>
        <LegalP>
          Privacy questions and requests can be sent to us using the details on
          our <LegalLink href="/contact">Contact &amp; Support</LegalLink> page.
        </LegalP>
      </>
    ),
  },
  {
    id: "what-we-collect",
    heading: "3. What we collect",
    body: (
      <>
        <LegalP>We collect only what we need to run your booking. That is:</LegalP>
        <LegalList>
          <li>
            <strong className="font-medium text-fg">Your name</strong>, so we
            can address you and identify you in class.
          </li>
          <li>
            <strong className="font-medium text-fg">Your phone number</strong>,
            so we can reach you about a session change, a cancellation or a
            class that has been moved.
          </li>
          <li>
            <strong className="font-medium text-fg">Your email address</strong>,
            so we can send your booking confirmation and invoices.
          </li>
          <li>
            <strong className="font-medium text-fg">Your booking details</strong> —
            the session, class or package you booked, the date and time, the
            studio branch, and the instructor assigned.
          </li>
          <li>
            <strong className="font-medium text-fg">Payment transaction
            references</strong> — the payment order reference, payment
            reference and signature, the amount paid, and the payment status.
          </li>
          <li>
            <strong className="font-medium text-fg">Records we create as a
            member</strong> — for example, session credits used, attendance and
            cancellation history, invoices raised, and any notes a staff member
            makes about your membership.
          </li>
        </LegalList>
        <LegalP>
          If you get in touch with us first, we may also hold the content of your
          message.
        </LegalP>
      </>
    ),
  },
  {
    id: "what-we-do-not-collect",
    heading: "4. What we do not collect",
    body: (
      <>
        <LegalP>
          We do not ask for, receive or store your card number, card expiry,
          CVV, net banking password or UPI PIN. Those are entered directly on
          your payment provider&rsquo;s page and never pass through our
          systems.
        </LegalP>
        <LegalP>
          We do not collect health information unless you choose to tell an
          instructor about an injury or condition at the studio, in which case
          it is handled as a studio safety matter rather than stored on your
          account.
        </LegalP>
      </>
    ),
  },
  {
    id: "why",
    heading: "5. Why we collect it",
    body: (
      <>
        <LegalP>
          We rely on this information to do the things you have asked us for.
          Specifically, we use it to:
        </LegalP>
        <LegalList>
          <li>
            <strong className="font-medium text-fg">Confirm payment and issue
            your invoice.</strong> We check the transaction reference our payment
            provider returns so that we do not confirm a booking that was not
            paid for.
          </li>
          <li>
            <strong className="font-medium text-fg">Create and hold your
            booking</strong> for the session, class and time you chose, and
            check capacity so the session is not oversubscribed.
          </li>
          <li>
            <strong className="font-medium text-fg">Maintain your membership
            record</strong> — session credits, plan validity and attendance
            history — so you can see what you are entitled to.
          </li>
          <li>
            <strong className="font-medium text-fg">Contact you</strong> about
            your booking: confirmations, cancellations, instructor or schedule
            changes, and reminders about an upcoming session.
          </li>
          <li>
            <strong className="font-medium text-fg">Respond to you and
            support you</strong>, including handling a cancellation or refund
            request.
          </li>
          <li>
            <strong className="font-medium text-fg">Meet our legal and
            accounting obligations</strong>, which includes keeping transaction
            records and issuing tax invoices.
          </li>
        </LegalList>
        <LegalP>
          We do not use your information for unrelated marketing, and we do not
          sell or rent it to anyone.
        </LegalP>
      </>
    ),
  },
  {
    id: "processors",
    heading: "6. Service providers we share it with",
    body: (
      <>
        <LegalP>
          A small number of providers process data on our behalf so the service
          can work. They act on our instructions and are not free to use your
          information for their own purposes.
        </LegalP>
        <LegalList>
          <li>
            <strong className="font-medium text-fg">Payment provider</strong> —
            to take payment, confirm it, issue refunds and provide your receipt.
            Your card or UPI credentials are entered on their page, not ours.
          </li>
          <li>
            <strong className="font-medium text-fg">Cloud database and hosting
            provider</strong> — to store your booking and membership records and
            to run this website.
          </li>
          <li>
            <strong className="font-medium text-fg">Sign-in provider</strong> —
            if you sign in with a Google account, they confirm your identity to
            us. We do not receive your Google password.
          </li>
          <li>
            <strong className="font-medium text-fg">Email and messaging
            providers</strong> — to deliver your confirmation, invoice and
            reminders.
          </li>
        </LegalList>
        <LegalP>
          Where a provider processes data outside India, it does so under
          appropriate contractual safeguards.
        </LegalP>
      </>
    ),
  },
  {
    id: "security",
    heading: "7. How we protect it",
    body: (
      <>
        <LegalP>
          Reasonable measures we take include:
        </LegalP>
        <LegalList>
          <li>
            Restricting who inside the studio can see member contact details and
            payment records, and only where their role requires it.
          </li>
          <li>
            Keeping payment credentials entirely at our payment provider, so
            they never reach our systems.
          </li>
          <li>
            Verifying that a payment has genuinely been made before confirming
            a booking, so that no booking can be created without a real
            transaction.
          </li>
          <li>
            Protecting the areas of the website that hold member information
            behind a login, so it is not publicly readable.
          </li>
          <li>
            Requiring administrators to authenticate before accessing studio
            settings or member records.
          </li>
        </LegalList>
        <LegalP>
          No system is perfectly secure. If we become aware of a breach that
          affects your information and is likely to cause you serious harm, we
          will tell you and the relevant authority as required by law.
        </LegalP>
      </>
    ),
  },
  {
    id: "sharing",
    heading: "8. When we disclose information",
    body: (
      <>
        <LegalP>We do not sell or rent your personal information.</LegalP>
        <LegalP>We may disclose your information where:</LegalP>
        <LegalList>
          <li>
            it is needed to process your payment, as described in section 6;
          </li>
          <li>
            we are required to disclose it by law, a court order or a competent
            authority;
          </li>
          <li>
            it is necessary to protect the safety of staff, members or the
            public, or to investigate fraud or abuse;
          </li>
          <li>
            the business is restructured or transferred, in which case your
            booking records move with it and continue to be handled under this
            policy.
          </li>
        </LegalList>
      </>
    ),
  },
  {
    id: "retention",
    heading: "9. How long we keep it",
    body: (
      <>
        <LegalP>
          We keep booking and payment records for as long as they are needed for
          accounting, tax and dispute purposes, and membership records for as
          long as you remain a member. Where a period is required by law, we
          follow it.
        </LegalP>
        <LegalP>
          If you ask us to delete your information we will do so where we are
          able, except for records we must keep by law — for example tax
          invoices. Ask us using the details on our{" "}
          <LegalLink href="/contact">Contact &amp; Support</LegalLink> page.
        </LegalP>
      </>
    ),
  },
  {
    id: "rights",
    heading: "10. Your rights and choices",
    body: (
      <>
        <LegalP>You can ask us to:</LegalP>
        <LegalList>
          <li>confirm what information we hold about you, and provide a copy;</li>
          <li>correct information that is wrong or out of date;</li>
          <li>
            delete information we no longer need, subject to the records we
            must keep by law;
          </li>
          <li>
            withdraw from future messages. Note that we still need to contact
            you about sessions you have booked, even if you stop marketing
            messages.
          </li>
        </LegalList>
        <LegalP>
          Send your request through our{" "}
          <LegalLink href="/contact">Contact &amp; Support</LegalLink> page. We
          will need to verify your identity before we can act on it, so that
          nobody else can ask for your records.
        </LegalP>
      </>
    ),
  },
  {
    id: "children",
    heading: "11. Children",
    body: (
      <LegalP>
        These services are for adults. We do not knowingly collect information
        from anyone under 18. If you believe a child has given us information,
        please contact us and we will remove it.
      </LegalP>
    ),
  },
  {
    id: "changes",
    heading: "12. Changes to this policy",
    body: (
      <>
        <LegalP>
          We may update this policy. The &ldquo;Last updated&rdquo; date at the
          top of this page shows when it last changed. Where a change affects
          how we use information you have already given us, we will tell you
          before it takes effect.
        </LegalP>
        <LegalP>
          This policy forms part of our{" "}
          <LegalLink href="/terms">Terms &amp; Conditions</LegalLink> and
          should be read with our{" "}
          <LegalLink href="/refund-policy">
            Refund &amp; Cancellation Policy
          </LegalLink>
          .
        </LegalP>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      intro={
        <p>
          This explains what personal information {SITE.brandName} collects when
          you book with us, why we need it, and how it is handled. It is written
          to be read, not to be skipped.
        </p>
      }
      sections={sections}
    />
  );
}