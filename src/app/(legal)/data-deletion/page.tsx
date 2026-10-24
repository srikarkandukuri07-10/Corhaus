import type { Metadata } from "next";
import LegalShell, {
  LegalLink,
  LegalList,
  LegalP,
  type LegalSection,
} from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Data Deletion Instructions | Corhaus Pilates",
  description:
    "How to request deletion of your personal data, member profile, booking history, and WhatsApp communication logs from Corhaus Pilates For Everyone.",
};

const sections: LegalSection[] = [
  {
    id: "overview",
    heading: "1. Right to Erasure & Data Deletion",
    body: (
      <>
        <LegalP>
          At Corhaus Pilates (&ldquo;Corhaus Pilates For Everyone&rdquo;, operated
          by Yuksha Health Private Limited), we respect your privacy and your
          right to control your personal information under the Digital Personal
          Data Protection Act, 2023 (DPDP Act, 2023) and Meta&rsquo;s Platform
          policies.
        </LegalP>
        <LegalP>
          You may request the complete deletion of your member account, personal
          data, booking records, and WhatsApp conversation history at any time.
        </LegalP>
      </>
    ),
  },
  {
    id: "how-to-request",
    heading: "2. How to Request Data Deletion",
    body: (
      <>
        <LegalP>
          To submit a data deletion request, follow these simple steps:
        </LegalP>
        <LegalList>
          <li>
            Send an email to{" "}
            <a
              href="mailto:vkalladi@gmail.com?subject=Data%20deletion%20request"
              className="font-semibold text-fg underline underline-offset-2 hover:text-accent"
            >
              vkalladi@gmail.com
            </a>
            .
          </li>
          <li>
            Set the subject line exactly to:{" "}
            <strong className="font-semibold text-fg">
              &ldquo;Data deletion request&rdquo;
            </strong>
            .
          </li>
          <li>
            In the body of your email, please include:
            <ul className="mt-2 list-circle space-y-1 pl-5 text-sm text-fg-3">
              <li>Your full name as registered with Corhaus Pilates</li>
              <li>Your registered phone number (with country code, e.g. +91)</li>
              <li>Your registered email address</li>
            </ul>
          </li>
        </LegalList>
        <LegalP>
          Our privacy team will verify your identity to ensure that deletion
          requests originate from the authorized account owner before proceeding.
        </LegalP>
      </>
    ),
  },
  {
    id: "timeline",
    heading: "3. Processing Timeline & Confirmation",
    body: (
      <>
        <LegalP>
          Once your request is received and verified:
        </LegalP>
        <LegalList>
          <li>
            We will process your data deletion within{" "}
            <strong className="font-semibold text-fg">30 days</strong> of
            receiving your request.
          </li>
          <li>
            You will receive a formal confirmation email sent to your registered
            email address once the deletion process is complete.
          </li>
        </LegalList>
      </>
    ),
  },
  {
    id: "what-is-deleted",
    heading: "4. What Information is Deleted",
    body: (
      <>
        <LegalP>
          When your request is completed, the following data is permanently
          erased from our active production systems:
        </LegalP>
        <LegalList>
          <li>
            <strong className="font-medium text-fg">Member profile &amp; account details:</strong>{" "}
            Your name, phone number, email address, password/auth tokens, and
            personal notes.
          </li>
          <li>
            <strong className="font-medium text-fg">Class &amp; booking history:</strong>{" "}
            Historical reservations, session credits, attendance records, and
            instructor assignment logs.
          </li>
          <li>
            <strong className="font-medium text-fg">WhatsApp messaging records:</strong>{" "}
            All inbound and outbound WhatsApp message logs, conversation threads,
            delivery status logs, and phone number links stored in our WhatsApp
            database.
          </li>
        </LegalList>
      </>
    ),
  },
  {
    id: "what-is-retained",
    heading: "5. Information Retained for Statutory Compliance",
    body: (
      <>
        <LegalP>
          In accordance with Indian tax laws, accounting standards, and statutory
          regulations, certain financial records cannot be immediately erased:
        </LegalP>
        <LegalList>
          <li>
            <strong className="font-medium text-fg">Statutory tax invoices &amp; accounting records:</strong>{" "}
            Payment transactions, GST invoices, and financial ledger entries
            associated with past purchases will be retained for the mandatory
            retention period required by Indian law (such as the Goods and
            Services Tax Act and the Companies Act).
          </li>
          <li>
            These retained financial records are archived securely, isolated
            from active operational systems, and used exclusively for tax,
            audit, and compliance reporting.
          </li>
        </LegalList>
      </>
    ),
  },
  {
    id: "opt-out-alternative",
    heading: "6. WhatsApp Opt-Out Without Account Deletion",
    body: (
      <>
        <LegalP>
          If you wish to stop receiving automated WhatsApp reminders or messages
          without deleting your studio account and session credits, you can simply:
        </LegalP>
        <LegalList>
          <li>
            Reply <strong className="font-medium text-fg">&ldquo;STOP&rdquo;</strong> to
            any WhatsApp message from Corhaus Pilates.
          </li>
          <li>
            Or email{" "}
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
          Your membership and booking privileges will remain intact, and you will
          no longer receive WhatsApp messages.
        </LegalP>
      </>
    ),
  },
  {
    id: "contact",
    heading: "7. Contact Information",
    body: (
      <>
        <LegalP>
          If you have any questions about this Data Deletion policy or your
          personal data, please contact:
        </LegalP>
        <div className="mt-3 rounded-2xl border border-line bg-surface p-4 text-sm text-fg-2">
          <p className="font-semibold text-fg">Yuksha Health Private Limited</p>
          <p className="text-xs text-fg-3">Trading as Corhaus Pilates For Everyone</p>
          <p className="mt-2">Hyderabad, Telangana, India</p>
          <p className="mt-1">
            Email:{" "}
            <a
              href="mailto:vkalladi@gmail.com"
              className="font-medium text-fg underline underline-offset-2 hover:text-accent"
            >
              vkalladi@gmail.com
            </a>
          </p>
        </div>
        <LegalP>
          For more details on our privacy practices, please see our{" "}
          <LegalLink href="/privacy">Privacy Policy</LegalLink>.
        </LegalP>
      </>
    ),
  },
];

export default function DataDeletionPage() {
  return (
    <LegalShell
      title="User Data Deletion Instructions"
      intro={
        <p>
          Instructions for members and visitors of Corhaus Pilates For Everyone
          (operated by Yuksha Health Private Limited) to request the deletion of
          their personal data, member profile, and WhatsApp communications in
          accordance with data protection laws and Meta Platform policies.
        </p>
      }
      sections={sections}
    />
  );
}
