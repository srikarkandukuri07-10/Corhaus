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
  title: "Refund & Cancellation Policy",
  description: `How cancellations, rescheduling and refund requests are handled for classes, trial sessions and personal training at ${SITE.brandName}.`,
};

const sections: LegalSection[] = [
  {
    id: "two-things",
    heading: "1. Two different things: cancelling a booking and getting money back",
    body: (
      <>
        <LegalP>
          These are often confused, so we want to be clear about the difference
          before we talk about amounts.
        </LegalP>
        <LegalList>
          <li>
            <strong className="font-medium text-fg">Cancelling a booking</strong>{" "}
            means releasing your place in a session you have reserved. This is
            something you can do yourself in your member account, within the
            window in section 3.
          </li>
          <li>
            <strong className="font-medium text-fg">Getting money back</strong>{" "}
            means a refund of money you have already paid. That is a separate
            request, reviewed by us, and is handled in section 5.
          </li>
        </LegalList>
        <LegalP>
          Cancelling on time restores your session credit. It does not by itself
          produce a refund. This is the single most common misunderstanding about
          our policies, so please read section 5 even if your plan is
          session-based.
        </LegalP>
      </>
    ),
  },
  {
    id: "payment-flow",
    heading: "2. What happens at each stage of payment",
    body: (
      <>
        <LegalP>
          We think it helps to set out plainly what each stage means, because
          &ldquo;I have paid&rdquo; and &ldquo;I have a booking&rdquo; are not
          always the same moment.
        </LegalP>
        <LegalOrderedList>
          <li>
            <strong className="font-medium text-fg">
              Payment not completed.
            </strong>{" "}
            If you do not finish payment — you close the checkout, payment is
            declined, or it times out — no booking is created and no trial fee is
            owed. You can simply try again.
          </li>
          <li>
            <strong className="font-medium text-fg">Payment successful.</strong>{" "}
            Your payment provider confirms to us that the money has been taken.
            This is the point at which the trial fee becomes payable.
          </li>
          <li>
            <strong className="font-medium text-fg">
              Booking confirmed.
            </strong>{" "}
            We then confirm your session and send you the details. We check
            that the payment reference is genuine and that the slot is still
            free before confirming.
          </li>
          <li>
            <strong className="font-medium text-fg">
              Payment taken but booking not confirmed.
            </strong>{" "}
            If money has been taken but we cannot confirm your session — for
            example the slot filled up in the meantime — we will contact you
            either to arrange an alternative or to process a refund under
            section 5. You do not need to chase us for this.
          </li>
          <li>
            <strong className="font-medium text-fg">Failed payment.</strong>{" "}
            A declined or failed payment does not create a booking. Any amount
            held but not captured by your provider is released back to you by
            your provider, normally within a few working days.
          </li>
        </LegalOrderedList>
      </>
    ),
  },
  {
    id: "cancellation",
    heading: "3. Cancelling a booking",
    body: (
      <>
        <LegalP>
          You can cancel a booking yourself from your member account. Our
          cancellation window is{" "}
          <strong className="font-semibold text-fg">
            {SITE.cancellationWindowHours} hours
          </strong>{" "}
          before the scheduled start time. The window shown in your account when
          you cancel is the window that applies to that booking.
        </LegalP>
        <LegalList>
          <li>
            <strong className="font-medium text-fg">On time</strong> — at least{" "}
            {SITE.cancellationWindowHours} hours before the session starts, your
            session credit is returned to your plan automatically.
          </li>
          <li>
            <strong className="font-medium text-fg">Late</strong> — inside that
            window, we cannot cancel the booking and the credit is not returned.
          </li>
          <li>
            <strong className="font-medium text-fg">No-show</strong> — if you
            do not attend and do not cancel in time, the session credit is not
            returned.
          </li>
        </LegalList>
        <LegalP>
          A session credit is not money. Returning a credit puts your session
          back in your plan; it does not put money back in your pocket.
        </LegalP>
      </>
    ),
  },
  {
    id: "rescheduling",
    heading: "4. Rescheduling",
    body: (
      <>
        <LegalP>
          We treat a reschedule as a cancellation followed by a new booking, so
          the {SITE.cancellationWindowHours}-hour window applies to the original
          slot. Rescheduling after that window is treated as a late cancellation
          followed by a fresh booking, which is subject to availability and to
          the plan credits you have left.
        </LegalP>
        <LegalP>
          If the studio changes or cancels your session, we will contact you to
          arrange an alternative at no extra cost.
        </LegalP>
      </>
    ),
  },
  {
    id: "refunds",
    heading: "5. Refund requests",
    body: (
      <>
        <LegalP>
          <strong className="font-semibold text-fg">
            Membership fees are non-refundable.
          </strong>{" "}
          This is recorded on every invoice we issue. It covers unused sessions,
          the unexpired remainder of a membership, and personal training packages
          that have not been used.
        </LegalP>
        <LegalP>
          The situations in which we will consider a refund of money actually
          paid are:
        </LegalP>
        <LegalList>
          <li>
            We took payment and were unable to confirm or deliver your booking.
          </li>
          <li>We cancelled or could not deliver a session you had paid for.</li>
          <li>
            A duplicate payment was taken, or a trial session was paid for and
            we were unable to seat you because you booked it in error.
          </li>
          <li>
            A demonstrable technical failure meant you could not complete a
            payment you intended to make.
          </li>
          <li>
            Any other case where the law requires us to refund you.
          </li>
        </LegalList>
        <LegalP>To ask for a refund:</LegalP>
        <LegalOrderedList>
          <li>
            Contact us through the{" "}
            <LegalLink href="/contact">Contact &amp; Support</LegalLink> page as
            soon as you can.
          </li>
          <li>
            Include the name on the booking, the session date, and the payment
            reference from your invoice or receipt.
          </li>
          <li>
            Tell us briefly what happened. We will confirm what we can do.
          </li>
        </LegalOrderedList>
        <LegalP>
          Refunds are issued to the original payment method through our payment
          provider, and are not transferable to another person or account. Once
          we agree to a refund, it is submitted to the provider, and the time it
          takes to appear on your statement depends on your bank or provider
          rather than on us. We will tell you when we have submitted it.
        </LegalP>
      </>
    ),
  },
  {
    id: "trial",
    heading: "6. Trial sessions specifically",
    body: (
      <>
        <LegalP>
          A Trial Session is a single-use, non-transferable class at a fee of{" "}
          <strong className="font-semibold text-fg">
            {formatRupees(SITE.trial.priceRupees)}
          </strong>
          . Because it is a one-off session rather than part of a membership, the
          non-refundable rule in section 5 does not automatically settle it — each
          request is considered on its own facts.
        </LegalP>
        <LegalP>Two points in particular:</LegalP>
        <LegalList>
          <li>
            If you cannot attend a trial you have paid for, contact us. We will
            look at whether we can move you to another slot, or refund you, based
            on how far ahead you told us and whether the place could be filled.
          </li>
          <li>
            The trial fee is not deducted from any later membership unless we
            specifically agree that with you in writing at the time.
          </li>
        </LegalList>
        <LegalP>
          If you take part in a trial and then join, normal membership terms
          apply from the day your membership begins.
        </LegalP>
      </>
    ),
  },
  {
    id: "studio-cancels",
    heading: "7. When the studio cancels",
    body: (
      <>
        <LegalP>
          If we cancel or cannot deliver a session you have booked, we will
          contact you and either offer an alternative or restore the session
          credit. Where the session was paid for separately, we will also offer
          a refund.
        </LegalP>
        <LegalP>
          Sessions with insufficient numbers booked may occasionally be
          rescheduled or combined. We will give you as much notice as we
          reasonably can.
        </LegalP>
      </>
    ),
  },
  {
    id: "no-chargeback",
    heading: "8. Raising a dispute with your bank first",
    body: (
      <>
        <LegalP>
          If you have a payment-related problem, please raise it with us first.
          Most questions — a duplicate charge, a trial you could not attend, a
          session we cancelled — are resolved faster and more simply directly
          with us than through your bank.
        </LegalP>
        <LegalP>
          Nothing here limits any right you have to raise a matter with your bank
          or with the relevant authority.
        </LegalP>
      </>
    ),
  },
  {
    id: "changes",
    heading: "9. Changes to this policy",
    body: (
      <LegalP>
        We may update this policy. The &ldquo;Last updated&rdquo; date at the top
        of this page shows when it last changed. The cancellation window in force
        is the one shown in your member account when you cancel. This policy
        should be read with our <LegalLink href="/terms">Terms &amp; Conditions</LegalLink>.
      </LegalP>
    ),
  },
];

export default function RefundPolicyPage() {
  return (
    <LegalShell
      title="Refund & Cancellation Policy"
      intro={
        <>
          <p>
            This explains what cancelling a booking does, what actually
            involves getting money back, and how to ask us. We have tried to
            state plainly what we can and cannot do, including the cases where
            the answer is no.
          </p>
          <p className="mt-3 text-fg-4">
            The most important point: cancelling on time returns your{" "}
            <strong className="font-semibold text-fg-2">session credit</strong>,
            not your money. Refunds are a separate request — see section 5.
          </p>
        </>
      }
      sections={sections}
    />
  );
}