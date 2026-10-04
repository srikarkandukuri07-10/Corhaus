// Unit checks for the invoice online-payment maths. These are pure functions,
// so they can be verified without valid Razorpay credentials.
import {
  outstandingBalance,
  canCollectOnline,
  type InvoiceForPayment,
} from "../src/lib/razorpay/invoicePayment";

let pass = 0;
let fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.error(
      `  FAIL  ${name}\n          expected: ${JSON.stringify(expected)}\n          actual:   ${JSON.stringify(actual)}`
    );
  }
}
function inv(o: Partial<InvoiceForPayment>): InvoiceForPayment {
  return {
    id: "i1",
    invoice_number: "INV-1",
    grand_total: 1000,
    amount_paid: 0,
    payment_status: "due",
    razorpay_payment_link_id: null,
    razorpay_payment_link_url: null,
    ...o,
  };
}

console.log("\n── Outstanding balance ────────────────────────────────────────────");
check("fully unpaid 1000", outstandingBalance({ grand_total: 1000, amount_paid: 0 }), 1000);
check("part paid 400 -> 600", outstandingBalance({ grand_total: 1000, amount_paid: 400 }), 600);
check("fully paid -> 0", outstandingBalance({ grand_total: 1000, amount_paid: 1000 }), 0);
check("overpaid never negative", outstandingBalance({ grand_total: 1000, amount_paid: 1500 }), 0);
check("nulls treated as 0", outstandingBalance({ grand_total: null, amount_paid: null }), 0);
check("null paid on a total", outstandingBalance({ grand_total: 500, amount_paid: null }), 500);
check("no float drift on odd paise", outstandingBalance({ grand_total: 999.99, amount_paid: 0 }), 999.99);
check("sub-rupee remainder clamps at 0", outstandingBalance({ grand_total: 1000, amount_paid: 1000.001 }), 0);

console.log("\n── Eligibility for an online payment link ──────────────────────────");
check("due invoice is collectable", canCollectOnline(inv({ payment_status: "due" })), true);
check("partial invoice is collectable", canCollectOnline(inv({ payment_status: "partial", amount_paid: 400 })), true);
check("already-paid invoice is NOT collectable", canCollectOnline(inv({ payment_status: "paid", amount_paid: 1000 })), false);
check("zero outstanding is NOT collectable", canCollectOnline(inv({ grand_total: 0 })), false);

console.log(`\n${"=".repeat(58)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(58)}\n`);
process.exit(fail === 0 ? 0 : 1);