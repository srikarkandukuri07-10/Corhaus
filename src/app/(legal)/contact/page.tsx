import type { Metadata } from "next";
import Link from "next/link";
import LegalShell, {
  LegalLink,
  LegalList,
  LegalP,
} from "@/components/legal-shell";
import {
  formatRupees,
  hasCompleteContact,
  SITE,
} from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "Contact & Support",
  description: `Contact ${SITE.brandName} for bookings, cancellations, refunds and support. Operated by ${SITE.legalEntity.name}.`,
};

/** One contact row. Renders a visible gap notice rather than a fake value. */
function ContactRow({
  label,
  value,
  href,
  mono,
}: {
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-fg-4">
        {label}
      </p>
      {value ? (
        href ? (
          <a
            href={href}
            className={`mt-1.5 block break-words text-sm font-medium text-fg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${mono ? "font-mono" : ""}`}
          >
            {value}
          </a>
        ) : (
          <p className={`mt-1.5 break-words text-sm font-medium text-fg ${mono ? "font-mono" : ""}`}>
            {value}
          </p>
        )
      ) : (
        // Deliberate, visible gap. No fabricated phone number or address.
        <p className="mt-1.5 break-words rounded-lg border border-dashed border-line-2 bg-surface-2 px-2.5 py-1.5 text-xs text-fg-4">
          <span className="font-semibold text-fg-3">Not yet published.</span>{" "}
          Please contact the studio directly in the meantime.
        </p>
      )}
    </div>
  );
}

export default function ContactPage() {
  const c = SITE.contact;
  const complete = hasCompleteContact();

  return (
    <LegalShell
      title="Contact & Support"
      updated={false}
      intro={
        <p>
          Questions about a booking, a cancellation, a refund or your membership?
          The fastest way to get an answer about a specific session is to contact
          the studio, quoting your name and the session date.
        </p>
      }
    >
      {!complete && (
        <section className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            Studio contact details are still being published.
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-amber-900/90 dark:text-amber-100/90">
            Some details below are not available on this website yet. Please ask
            at the studio in the meantime. We are adding them.
          </p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight text-fg sm:text-xl">
          Get in touch
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ContactRow
            label="Support email"
            value={c.supportEmail}
            href={c.supportEmail ? `mailto:${c.supportEmail}` : undefined}
            mono
          />
          <ContactRow
            label="Support phone"
            value={c.supportPhone}
            href={
              c.supportPhone
                ? `tel:${String(c.supportPhone).replace(/\s+/g, "")}`
                : undefined
            }
            mono
          />
          <ContactRow
            label="Studio address"
            value={[c.addressLine1, c.addressLine2].filter(Boolean).join(", ")}
          />
          <ContactRow
            label="City, state &amp; PIN"
            value={[c.city, c.state, c.pinCode].filter(Boolean).join(", ")}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight text-fg sm:text-xl">
          What to include
        </h2>
        <div className="mt-3 space-y-3.5 text-[15px] leading-relaxed text-fg-2">
          <LegalP>
            So we can find your booking quickly, please include:
          </LegalP>
          <LegalList>
            <li>the full name the session was booked under;</li>
            <li>
              the date and time of the session, or the date you booked;
            </li>
            <li>
              for a payment or refund query, the payment reference from your
              invoice or receipt.
            </li>
          </LegalList>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight text-fg sm:text-xl">
          Before you write
        </h2>
        <div className="mt-3 space-y-3.5 text-[15px] leading-relaxed text-fg-2">
          <LegalP>Most questions are answered faster in our policies:</LegalP>
          <LegalList>
            <li>
              <LegalLink href="/refund-policy">
                Refund &amp; Cancellation Policy
              </LegalLink>{" "}
              — cancelling a booking, the {SITE.cancellationWindowHours}-hour
              window, and how refund requests work.
            </li>
            <li>
              <LegalLink href="/terms">Terms &amp; Conditions</LegalLink> — how
              booking, attendance, credits and memberships work.
            </li>
            <li>
              <LegalLink href="/privacy">Privacy Policy</LegalLink> — what we
              collect and how we handle it.
            </li>
          </LegalList>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-fg">Booking a session</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-2">
          To book a {SITE.trial.name} ({formatRupees(SITE.trial.priceRupees)}) or
          to manage an existing booking, use your member account or the booking
          page.
        </p>
        <Link
          href="/book-trial"
          className="mt-4 inline-flex items-center justify-center rounded-xl bg-rail px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-rail/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          Go to booking page
        </Link>
      </section>

      <section className="mt-8 rounded-2xl border border-line bg-surface-2/40 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-fg">Legal entity</h2>
        <dl className="mt-3 space-y-2 text-[13px]">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-fg-4">Registered name</dt>
            <dd className="font-semibold text-fg">{SITE.legalEntity.name}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-fg-4">GSTIN</dt>
            <dd className="font-mono text-fg">{SITE.legalEntity.gstin}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-fg-4">PAN</dt>
            <dd className="font-mono text-fg">{SITE.legalEntity.pan}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-fg-4">State</dt>
            <dd className="font-medium text-fg">{SITE.legalEntity.state}</dd>
          </div>
        </dl>
      </section>
    </LegalShell>
  );
}