import type { Metadata } from "next";
import LegalShell, {
  LegalLink,
  LegalList,
  LegalOrderedList,
  LegalP,
  type LegalSection,
} from "@/components/legal-shell";
import { SITE, formatRupees } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: `Terms and Conditions for booking classes, trial sessions and personal training at ${SITE.brandName}.`,
};

const sections: LegalSection[] = [
  {
    id: "acceptance",
    heading: "1. Acceptance of these terms",
    body: (
      <>
        <LegalP>
          These Terms &amp; Conditions govern your use of {SITE.brandName} and
          your booking of any class, trial session or personal training session
          with us. By browsing this website, booking a session, or paying for a
          trial session, you agree to be bound by these terms.
        </LegalP>
        <LegalP>
          If you do not agree with any part of these terms, please do not use
          the website or book a session. These terms are written in plain
          language; where a term is binding on us, we have tried to say so
          clearly.
        </LegalP>
      </>
    ),
  },
  {
    id: "about",
    heading: "2. Who we are and what we offer",
    body: (
      <>
        <LegalP>
          {SITE.brandName} is a Pilates and wellness studio. {SITE.tagline}.
          Sessions are operated by{" "}
          <strong className="font-semibold text-fg">
            {SITE.legalEntity.name}
          </strong>{" "}
          (GSTIN {SITE.legalEntity.gstin}).
        </LegalP>
        <LegalP>We offer the following:</LegalP>
        <LegalList>
          <li>
            <strong className="font-medium text-fg">Group classes</strong> —
            scheduled Pilates sessions led by an instructor, booked for a
            specific date and time.
          </li>
          <li>
            <strong className="font-medium text-fg">Personal training (PT)
            sessions</strong> — one-to-one sessions with a trainer.
          </li>
          <li>
            <strong className="font-medium text-fg">Trial Session</strong> — a
            single introductory class, described in section 3.
          </li>
          <li>
            <strong className="font-medium text-fg">Memberships and session
            packs</strong> — purchased plans that give you access to a number of
            sessions or a period of time.
          </li>
        </LegalList>
        <LegalP>
          Class schedules, instructors and availability change. We may add,
          reschedule or withdraw sessions where required for operational
          reasons, and will communicate changes through the website or by
          message where you have a booking affected.
        </LegalP>
      </>
    ),
  },
  {
    id: "trial",
    heading: "3. The Trial Session",
    body: (
      <>
        <LegalP>
          A Trial Session is a single introductory class intended so you can try
          {SITE.brandName} before committing to a membership. The trial session
          fee is currently{" "}
          <strong className="font-semibold text-fg">
            {formatRupees(SITE.trial.priceRupees)}
          </strong>
          . {SITE.trial.priceNote}
        </LegalP>
        <LegalP>
          When you book a Trial Session you choose an available date and time
          slot. Your booking is confirmed for that slot once payment succeeds.
          If the slot you selected is no longer available by the time your
          payment completes, we will contact you to arrange an alternative.
        </LegalP>
        <LegalP>
          A Trial Session is a single-use session. It does not carry over, and
          it is not part of a membership unless you separately convert to one.
        </LegalP>
      </>
    ),
  },
  {
    id: "payment",
    heading: "4. Payment and booking confirmation",
    body: (
      <>
        <LegalP>
          Payment for a Trial Session is required before the booking is
          confirmed. We accept payment through the payment provider shown at
          checkout. The amount charged is determined by us and displayed to you
          before you pay.
        </LegalP>
        <LegalP>
          Your booking is confirmed only after our payment provider confirms to
          us that the payment was successful. If payment is not completed, or
          is declined, or you close the checkout window without paying, then no
          booking is created and no trial fee is owed. If a payment is taken but
          we are unable to confirm a booking, we will contact you and either
          arrange the session or process a refund in line with our{" "}
          <LegalLink href="/refund-policy">Refund &amp; Cancellation Policy</LegalLink>.
        </LegalP>
        <LegalP>
          Prices are shown in Indian Rupees and are inclusive of applicable taxes
          where we are required to collect them. A tax invoice is issued for
          every payment we collect.
        </LegalP>
      </>
    ),
  },
  {
    id: "information",
    heading: "5. Information you provide",
    body: (
      <>
        <LegalP>
          To book and attend a session we need your full name, phone number,
          email address, and the session you have booked. You are responsible
          for making sure this information is accurate and current. In
          particular:
        </LegalP>
        <LegalList>
          <li>
            Give us a phone number and email address you actually use, so we can
            reach you about a booking.
          </li>
          <li>
            Tell us promptly if any of it changes — an incorrect phone number
            may mean we cannot reach you about a schedule change.
          </li>
          <li>
            Do not book in the name of someone else. Attendance, membership
            credit and no-show records are recorded against the name you
            provide.
          </li>
        </LegalList>
        <LegalP>
          Booking a session on behalf of another person without telling us may
          lead us to cancel the booking, because we may be unable to verify who
          is attending.
        </LegalP>
      </>
    ),
  },
  {
    id: "attendance",
    heading: "6. Attending sessions",
    body: (
      <>
        <LegalP>
          Please arrive a few minutes before your session starts so you can set
          up. Sessions run to a fixed timetable and we ask that you arrive on
          time and leave on time so that other members are not affected.
        </LegalP>
        <LegalP>
          Please arrive in clothing and footwear suitable for Pilates and for
          the equipment used in the session room. Tell the instructor about any
          injury, pregnancy, or medical condition before exercising. Our
          instructors are not medical advisers, and you participate at your own
          risk; please seek medical advice first if you are unsure.
        </LegalP>
        <LegalP>
          Sessions may involve reformer equipment. Please do not move or adjust
          equipment unless an instructor has shown you how.
        </LegalP>
      </>
    ),
  },
  {
    id: "cancellation",
    heading: "7. Cancellation and rescheduling",
    body: (
      <>
        <LegalP>
          You can cancel a booking through your member account. Our current
          cancellation window is{" "}
          <strong className="font-semibold text-fg">
            {SITE.cancellationWindowHours} hours
          </strong>{" "}
          before the scheduled start time. The window shown in your account at
          the time of cancelling is the window that applies.
        </LegalP>
        <LegalP>
          If you cancel at least {SITE.cancellationWindowHours} hours before the
          session starts, the session credit is returned to your plan. If you
          cancel inside that window, or do not attend, the credit is not
          returned and our system will not permit the cancellation.
        </LegalP>
        <LegalP>
          Rescheduling is treated as a cancellation followed by a new booking,
          so the same window applies. Personal training sessions follow the same
          window as group classes. If the studio cancels or reschedules your
          session, we will contact you and arrange an alternative.
        </LegalP>
        <LegalP>
          Full detail, including how refund requests are handled, is in our{" "}
          <LegalLink href="/refund-policy">
            Refund &amp; Cancellation Policy
          </LegalLink>
          .
        </LegalP>
      </>
    ),
  },
  {
    id: "credits",
    heading: "8. Session credits and memberships",
    body: (
      <>
        <LegalP>
          Where a plan includes a set number of sessions, one session credit is
          deducted when you book and returned if you cancel in line with
          section 7. Time-based memberships are not affected by session credit.
        </LegalP>
        <LegalP>
          Credits are personal to you and cannot be transferred, resold or
          shared. Booking a session for someone else against your own credit
          may lead us to cancel the booking.
        </LegalP>
        <LegalP>
          Membership fees are charged for the period of the plan shown on your
          invoice. Your plan and its validity dates are visible in your member
          account.
        </LegalP>
      </>
    ),
  },
  {
    id: "refunds",
    heading: "9. Refunds",
    body: (
      <>
        <LegalP>
          Membership fees are non-refundable. This is the position recorded on
          every invoice we issue, and it applies to unused sessions and to the
          unexpired remainder of a plan.
        </LegalP>
        <LegalP>
          Payments are processed by our payment provider. Where a refund is
          approved under our{" "}
          <LegalLink href="/refund-policy">Refund &amp; Cancellation Policy</LegalLink>
          , it is issued to the original payment method through that provider and
          is not transferable. See that policy for how to request a refund and
          what happens next.
        </LegalP>
      </>
    ),
  },
  {
    id: "studio-rights",
    heading: "10. Changes by the studio",
    body: (
      <>
        <LegalP>
          We may modify or discontinue any part of our services, and we may
          change our schedules, instructors, session formats, pricing and
          policies. Where a change affects a session you have already booked,
          we will take reasonable steps to inform you and, where the change
          makes the session unavailable, to offer you an alternative.
        </LegalP>
        <LegalP>
          We may suspend or refuse a booking where we reasonably believe a
          session has been booked fraudulently, where a booking has been made
          in someone else&rsquo;s name, or where conduct at the studio threatens
          the safety or comfort of others. Where we suspend or refuse a booking
          that has been paid for, we will tell you why and apply our{" "}
          <LegalLink href="/refund-policy">Refund &amp; Cancellation Policy</LegalLink>
          .
        </LegalP>
      </>
    ),
  },
  {
    id: "liability",
    heading: "11. Liability",
    body: (
      <>
        <LegalP>
          Pilates involves physical movement. You participate voluntarily and
          at your own risk. To the fullest extent permitted by law, we are not
          liable for any injury, illness, loss or damage arising from your
          participation, except where our liability cannot lawfully be limited
          — for example, for death or personal injury caused by our negligence,
          or for fraud.
        </LegalP>
        <LegalP>
          Nothing in these terms limits your statutory rights as a consumer,
          including any right to a remedy where goods or services are not of
          a satisfactory quality, not as described, or not provided with due
          care and skill.
        </LegalP>
      </>
    ),
  },
  {
    id: "ip",
    heading: "12. Intellectual property and site use",
    body: (
      <>
        <LegalP>
          The Corhaus name, logo, class names, written materials, images and
          the design and content of this website belong to{" "}
          {SITE.legalEntity.name} or its licensors. You may view the site and
          print these pages for your own reference, but you may not reproduce,
          republish, resell or commercially exploit them without our written
          permission.
        </LegalP>
        <LegalP>
          Please do not attempt to disrupt the site, probe it for vulnerabilities
          without permission, or use automated tools to scrape content.
        </LegalP>
      </>
    ),
  },
  {
    id: "privacy",
    heading: "13. How we handle your information",
    body: (
      <>
        <LegalP>
          Booking a session requires us to collect and hold your personal and
          payment-related information. How we use and protect it is set out in
          our <LegalLink href="/privacy">Privacy Policy</LegalLink>, which forms
          part of these terms.
        </LegalP>
      </>
    ),
  },
  {
    id: "law",
    heading: "14. Governing law",
    body: (
      <>
        <LegalP>
          These terms are governed by the laws of{" "}
          {SITE.legalEntity.jurisdiction}. Where you are a consumer, this does
          not affect any mandatory protection you have under the law of your
          place of residence.
        </LegalP>
        <LegalP>
          Before a dispute arises we would much rather resolve it directly.
          Please contact us first using the details on our{" "}
          <LegalLink href="/contact">Contact &amp; Support</LegalLink> page.
        </LegalP>
      </>
    ),
  },
  {
    id: "changes",
    heading: "15. Changes to these terms",
    body: (
      <>
        <LegalP>
          We may update these terms. The &ldquo;Last updated&rdquo; date at the
          top of this page shows when they were last changed. Where a change is
          significant and affects a booking you have already made, we will
          contact you before it takes effect.
        </LegalP>
        <LegalP>
          Continuing to use the website or attending sessions after a change
          takes effect means you accept the updated terms.
        </LegalP>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms & Conditions"
      intro={
        <>
          <p>
            These terms explain the agreement between you and{" "}
            <strong className="font-semibold text-fg">
              {SITE.legalEntity.name}
            </strong>{" "}
            when you book classes, trial sessions or personal training at{" "}
            {SITE.brandName}.
          </p>
          <p className="mt-3 text-fg-4">
            Please read them before you book. For how we handle your personal
            information, see our{" "}
            <LegalLink href="/privacy">Privacy Policy</LegalLink>. For refunds and
            cancellations, see our{" "}
            <LegalLink href="/refund-policy">
              Refund &amp; Cancellation Policy
            </LegalLink>
            . Questions? Visit{" "}
            <LegalLink href="/contact">Contact &amp; Support</LegalLink>.
          </p>
        </>
      }
      sections={sections}
    >
      <section className="mt-10 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-fg">Quick reference</h2>
        <LegalOrderedList>
          <li>Trial session fee: {formatRupees(SITE.trial.priceRupees)}</li>
          <li>Payment is required before a trial booking is confirmed</li>
          <li>
            Free cancellation until {SITE.cancellationWindowHours} hours before
            your session starts
          </li>
          <li>Membership fees are non-refundable</li>
        </LegalOrderedList>
      </section>
    </LegalShell>
  );
}