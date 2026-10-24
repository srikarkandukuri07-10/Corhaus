import type { Metadata } from "next";
import LegalShell, {
  LegalLink,
  LegalList,
  LegalP,
  type LegalSection,
} from "@/components/legal-shell";
import { SITE } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "Privacy Policy | Corhaus Pilates",
  description:
    "How Corhaus Pilates For Everyone and Yuksha Health Private Limited collect, use, and protect your personal information, booking details, and WhatsApp communications under the Digital Personal Data Protection Act, 2023.",
};

const sections: LegalSection[] = [
  {
    id: "summary",
    heading: "1. Overview & Summary",
    body: (
      <>
        <LegalP>
          Corhaus Pilates (&ldquo;Corhaus Pilates For Everyone&rdquo;) operates a
          fitness and wellness studio managing members, class schedules, and
          session bookings. When you book a class, trial session, or package with
          us, we collect the necessary personal and contact details required to
          manage your booking, take payments, send booking confirmations and
          reminders, and provide customer support.
        </LegalP>
        <LegalP>
          We communicate with members directly via Meta&rsquo;s official WhatsApp
          Business Cloud API. We respect your privacy: we never sell or rent
          your data, we store only what is required to provide our fitness
          services, and you have complete control over your communications and
          personal data.
        </LegalP>
      </>
    ),
  },
  {
    id: "who",
    heading: "2. Who We Are & Contact Details",
    body: (
      <>
        <LegalP>
          The service is operated by{" "}
          <strong className="font-semibold text-fg">
            {SITE.legalEntity.name}
          </strong>{" "}
          (GSTIN {SITE.legalEntity.gstin}, PAN {SITE.legalEntity.pan}), trading
          as <strong className="font-semibold text-fg">Corhaus Pilates For Everyone</strong>.
        </LegalP>
        <LegalP>
          Our studio and registered operations are located in{" "}
          <strong className="font-semibold text-fg">Hyderabad, India</strong>.
        </LegalP>
        <LegalP>
          For any privacy inquiries, data access, or data deletion requests, you
          can reach our designated privacy team directly:
        </LegalP>
        <LegalList>
          <li>
            <strong className="font-medium text-fg">Email:</strong>{" "}
            <a
              href="mailto:vkalladi@gmail.com"
              className="text-fg underline underline-offset-2 hover:text-accent"
            >
              vkalladi@gmail.com
            </a>
          </li>
          <li>
            <strong className="font-medium text-fg">Location:</strong>{" "}
            Hyderabad, Telangana, India
          </li>
          <li>
            <strong className="font-medium text-fg">Data Deletion Instructions:</strong>{" "}
            Visit our{" "}
            <LegalLink href="/data-deletion">Data Deletion Instructions</LegalLink>{" "}
            page.
          </li>
        </LegalList>
      </>
    ),
  },
  {
    id: "what-we-collect",
    heading: "3. Information We Collect",
    body: (
      <>
        <LegalP>
          We collect only information essential to providing studio services,
          managing class bookings, and communicating session updates:
        </LegalP>
        <LegalList>
          <li>
            <strong className="font-medium text-fg">Member profile &amp; contact details:</strong>{" "}
            Your full name, phone number, and email address provided during
            registration or booking.
          </li>
          <li>
            <strong className="font-medium text-fg">Booking and attendance details:</strong>{" "}
            The sessions, classes, trial bookings, or membership packages you
            select, booking dates and times, studio room/location, instructor
            assignments, and attendance/check-in history.
          </li>
          <li>
            <strong className="font-medium text-fg">WhatsApp messaging data:</strong>{" "}
            When we send you booking confirmations, class reminders, or updates,
            we record WhatsApp message delivery status (e.g., sent, delivered,
            read, or failed) and the content of any replies or queries you send
            to our studio WhatsApp number so our staff can assist you.
          </li>
          <li>
            <strong className="font-medium text-fg">Payment &amp; transaction references:</strong>{" "}
            Payment provider order IDs, transaction IDs, payment status,
            amounts, and tax invoice records. (Note: we never collect, store, or
            see your credit/debit card numbers, CVVs, net-banking credentials, or
            UPI PINs).
          </li>
        </LegalList>
      </>
    ),
  },
  {
    id: "purpose",
    heading: "4. Purpose of Processing",
    body: (
      <>
        <LegalP>We process your personal information solely to:</LegalP>
        <LegalList>
          <li>
            Create, manage, and confirm your class and trial bookings, and track
            session attendance and membership credits.
          </li>
          <li>
            Send timely automated booking confirmations, schedule changes, and
            class reminders (for example, approximately 2 hours before your
            scheduled class) via WhatsApp and email.
          </li>
          <li>
            Allow studio staff to read and respond directly to your WhatsApp
            replies and customer support inquiries from our studio management
            dashboard.
          </li>
          <li>
            Generate official GST tax invoices and maintain accounting records as
            mandated by Indian tax authorities.
          </li>
        </LegalList>
      </>
    ),
  },
  {
    id: "whatsapp-platform",
    heading: "5. WhatsApp Communications & Meta Cloud API",
    body: (
      <>
        <LegalP>
          Our studio uses Meta&rsquo;s official WhatsApp Business Cloud API to
          dispatch transactional notifications (booking confirmations, class
          reminders, and receipts) and receive member responses.
        </LegalP>
        <LegalP>
          When you receive or send messages through WhatsApp, your communication
          is also subject to WhatsApp&rsquo;s own terms and privacy practices.
          You can review{" "}
          <a
            href="https://www.whatsapp.com/legal/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg underline underline-offset-2 hover:text-accent"
          >
            WhatsApp&rsquo;s Privacy Policy
          </a>{" "}
          and{" "}
          <a
            href="https://www.whatsapp.com/legal/business-terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg underline underline-offset-2 hover:text-accent"
          >
            WhatsApp Business Terms
          </a>
          .
        </LegalP>
      </>
    ),
  },
  {
    id: "consent-and-opt-out",
    heading: "6. Consent and Opt-Out",
    body: (
      <>
        <LegalP>
          By booking a session or providing your phone number on our website or
          at the studio, you consent to receiving operational and transactional
          updates regarding your classes via WhatsApp and SMS/email.
        </LegalP>
        <LegalP>
          <strong className="font-semibold text-fg">How to opt out:</strong> You
          have full control and can opt out of receiving WhatsApp messages at
          any time by:
        </LegalP>
        <LegalList>
          <li>
            Replying <strong className="font-medium text-fg">&ldquo;STOP&rdquo;</strong> to
            any WhatsApp message you receive from us.
          </li>
          <li>
            Sending an email with your registered phone number to{" "}
            <a
              href="mailto:vkalladi@gmail.com"
              className="text-fg underline underline-offset-2 hover:text-accent"
            >
              vkalladi@gmail.com
            </a>{" "}
            requesting removal from WhatsApp notifications.
          </li>
        </LegalList>
        <LegalP>
          Once opted out, you will no longer receive automated WhatsApp reminders
          for upcoming classes.
        </LegalP>
      </>
    ),
  },
  {
    id: "sharing",
    heading: "7. Data Sharing & Non-Sale of Data",
    body: (
      <>
        <LegalP>
          <strong className="font-semibold text-fg">
            We do not sell, rent, trade, or monetize your personal information
            to third-party advertisers or data brokers under any circumstances.
          </strong>
        </LegalP>
        <LegalP>
          We share your data strictly with trusted service providers necessary
          to operate our studio infrastructure:
        </LegalP>
        <LegalList>
          <li>
            <strong className="font-medium text-fg">Meta Platforms, Inc. (WhatsApp Cloud API):</strong>{" "}
            For delivering transactional WhatsApp notifications and messages.
          </li>
          <li>
            <strong className="font-medium text-fg">Cloud Hosting &amp; Database Providers:</strong>{" "}
            Secure cloud infrastructure (Vercel and Supabase) used to store your
            booking records, class schedules, and member accounts.
          </li>
          <li>
            <strong className="font-medium text-fg">Payment Processors:</strong>{" "}
            Authorized Indian payment gateways (such as Razorpay) for securely
            processing card, netbanking, and UPI payments without exposing
            financial credentials to us.
          </li>
          <li>
            <strong className="font-medium text-fg">Legal &amp; Regulatory Authorities:</strong>{" "}
            Only when required by Indian law, judicial summons, or statutory tax
            reporting obligations.
          </li>
        </LegalList>
      </>
    ),
  },
  {
    id: "retention",
    heading: "8. Data Retention Period",
    body: (
      <>
        <LegalP>
          We retain your personal profile, class history, and WhatsApp
          communication logs for the duration of your active membership plus{" "}
          <strong className="font-semibold text-fg">12 months</strong> following
          inactivity, to facilitate easy renewals and re-bookings.
        </LegalP>
        <LegalP>
          Following this period, or upon receiving a validated data deletion
          request, personal identifiers and messaging records are securely
          purged, except for financial invoices and tax documents that we are
          legally obligated to retain under Indian commercial and taxation laws.
        </LegalP>
      </>
    ),
  },
  {
    id: "security",
    heading: "9. Security Safeguards",
    body: (
      <>
        <LegalP>
          We implement industry-standard technical and organizational security
          measures to safeguard your data, including:
        </LegalP>
        <LegalList>
          <li>
            Encrypted data transmission across all services using modern
            TLS/HTTPS protocols.
          </li>
          <li>
            Strict role-based access control ensuring only authorized studio
            staff can access member directories and conversation records.
          </li>
          <li>
            Secure API authentication, including cryptographic HMAC-SHA256
            signature verification for all inbound Meta WhatsApp webhooks.
          </li>
          <li>
            Complete separation from payment instruments: card and banking
            credentials are never collected or stored on our servers.
          </li>
        </LegalList>
      </>
    ),
  },
  {
    id: "rights",
    heading: "10. Your Rights & Data Deletion",
    body: (
      <>
        <LegalP>
          You have the right to access, review, correct, or request the
          permanent erasure of your personal data held by us.
        </LegalP>
        <LegalP>
          To exercise your rights or request deletion of your account and WhatsApp
          messaging history, please email{" "}
          <a
            href="mailto:vkalladi@gmail.com"
            className="text-fg underline underline-offset-2 hover:text-accent"
          >
            vkalladi@gmail.com
          </a>{" "}
          with the subject line &ldquo;Data deletion request&rdquo; along with your
          registered phone number.
        </LegalP>
        <LegalP>
          Detailed instructions on our data deletion workflows are available on
          our dedicated{" "}
          <LegalLink href="/data-deletion">Data Deletion page</LegalLink>.
        </LegalP>
      </>
    ),
  },
  {
    id: "governing-law",
    heading: "11. Governing Law & DPDP Act, 2023",
    body: (
      <>
        <LegalP>
          This policy and all data handling activities are governed by the laws
          of India, including the{" "}
          <strong className="font-semibold text-fg">
            Digital Personal Data Protection Act, 2023 (DPDPA 2023)
          </strong>{" "}
          and the Information Technology Act, 2000.
        </LegalP>
        <LegalP>
          Any disputes arising hereunder shall be subject to the exclusive
          jurisdiction of the competent courts in Hyderabad, Telangana, India.
        </LegalP>
      </>
    ),
  },
  {
    id: "changes",
    heading: "12. Policy Updates",
    body: (
      <>
        <LegalP>
          We may update this Privacy Policy from time to time to reflect operational,
          legal, or regulatory changes. The date at the top of this document
          reflects the last revision. Continued use of our booking service or
          studio after changes take effect constitutes acceptance of the revised
          policy.
        </LegalP>
        <LegalP>
          Please also review our{" "}
          <LegalLink href="/terms">Terms &amp; Conditions</LegalLink>,{" "}
          <LegalLink href="/refund-policy">Refund &amp; Cancellation Policy</LegalLink>,
          and{" "}
          <LegalLink href="/data-deletion">Data Deletion Instructions</LegalLink>.
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
          This Privacy Policy explains how Corhaus Pilates For Everyone
          (operated by Yuksha Health Private Limited) collects, protects, and
          manages your information, bookings, and WhatsApp communications in
          compliance with India&rsquo;s Digital Personal Data Protection Act,
          2023.
        </p>
      }
      sections={sections}
    />
  );
}
