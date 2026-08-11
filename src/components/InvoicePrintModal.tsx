"use client";

import { useEffect, useState } from "react";
import { InvoiceSettingsData, DEFAULT_INVOICE_SETTINGS } from "@/app/api/admin/settings/invoice/route";

interface InvoiceItem {
  id?: string;
  name: string;
  category?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface InvoiceData {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  subtotal: number;
  discount_type?: string | null;
  discount_value?: number;
  discount_amount: number;
  grand_total: number;
  payment_status: string;
  payment_method?: string | null;
  amount_paid: number;
  transaction_reference?: string | null;
  notes?: string | null;
  created_at: string;
  invoice_items?: InvoiceItem[];
}

interface Props {
  invoice: InvoiceData;
  onClose: () => void;
}

function fmt(n: number) {
  return "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

import { formatDate } from "@/lib/date-utils";

function calculateDueDate(iso: string, days: number) {
  if (!iso) return "";
  const d = new Date(iso);
  d.setDate(d.getDate() + (days || 15));
  return formatDate(d);
}

export default function InvoicePrintModal({ invoice, onClose }: Props) {
  const [settings, setSettings] = useState<InvoiceSettingsData>(DEFAULT_INVOICE_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/admin/settings/invoice");
        const data = await res.json();
        if (data && data.settings) {
          setSettings(data.settings);
        }
      } catch (err) {
        console.error("Failed to load invoice settings for print:", err);
      } finally {
        setLoadingSettings(false);
      }
    }
    loadSettings();
  }, []);

  function handlePrint() {
    window.print();
  }

  // Calculate Tax breakdown
  const taxableAmount = Math.max(0, invoice.subtotal - (invoice.discount_amount || 0));
  let cgst = 0;
  let sgst = 0;
  let printSubtotal = invoice.subtotal;
  let printGrandTotal = invoice.grand_total;

  if (settings.issue_tax_invoices) {
    if (settings.tax_pricing_mode === "inclusive") {
      // 18% GST included: Base = Taxable / 1.18, Tax = Taxable - Base
      const base = taxableAmount / 1.18;
      const totalTax = taxableAmount - base;
      cgst = totalTax / 2;
      sgst = totalTax / 2;
    } else {
      // 18% GST exclusive: Tax = Taxable * 0.18
      cgst = taxableAmount * 0.09;
      sgst = taxableAmount * 0.09;
      printGrandTotal = taxableAmount + cgst + sgst;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-invoice-area, #printable-invoice-area * {
            visibility: visible;
          }
          #printable-invoice-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20px;
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-surface border border-line rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl my-8">
        {/* Modal Toolbar (hidden in print) */}
        <div className="no-print flex items-center justify-between px-6 py-4 border-b border-line bg-surface-2/40">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <h3 className="text-sm font-bold text-fg">Tax Invoice Preview &amp; Download</h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold shadow-md hover:opacity-90 transition-all flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print / Download PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl border border-line text-fg-4 hover:text-fg hover:bg-surface-2 transition-all"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Printable Area */}
        <div id="printable-invoice-area" className="p-8 bg-white text-gray-900 space-y-6">
          {/* Header row */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-gray-200 pb-6">
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                {settings.legal_business_name || "CORHAUS GYM & FITNESS"}
              </h1>
              {settings.issue_tax_invoices && (
                <div className="text-xs text-gray-600 mt-1 space-y-0.5 font-mono">
                  {settings.gstin && <p>GSTIN: <span className="font-semibold text-gray-900">{settings.gstin}</span></p>}
                  {settings.pan && <p>PAN: <span className="font-semibold text-gray-900">{settings.pan}</span></p>}
                  {settings.state && <p>State: <span className="font-semibold text-gray-900">{settings.state}</span></p>}
                </div>
              )}
            </div>

            <div className="text-left sm:text-right">
              <div className="inline-block px-3 py-1 rounded-md bg-gray-100 border border-gray-300 text-xs font-bold uppercase tracking-wider text-gray-800 mb-2">
                TAX INVOICE
              </div>
              <p className="text-lg font-mono font-bold text-gray-900">{invoice.invoice_number}</p>
              <p className="text-xs text-gray-500 mt-1">Date: <span className="font-semibold text-gray-900">{formatDate(invoice.created_at)}</span></p>
              <p className="text-xs text-gray-500">Due Date: <span className="font-semibold text-gray-900">{calculateDueDate(invoice.created_at, settings.default_payment_due_days)}</span></p>
            </div>
          </div>

          {/* Customer & Payment Info */}
          <div className="grid grid-cols-2 gap-6 p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs">
            <div>
              <p className="font-bold text-gray-400 uppercase tracking-wider text-[10px] mb-1">Billed To</p>
              <p className="font-bold text-gray-900 text-sm">{invoice.customer_name}</p>
              {invoice.customer_phone && <p className="text-gray-600 font-mono mt-0.5">{invoice.customer_phone}</p>}
              {invoice.customer_email && <p className="text-gray-600 mt-0.5">{invoice.customer_email}</p>}
            </div>

            <div>
              <p className="font-bold text-gray-400 uppercase tracking-wider text-[10px] mb-1">Payment Status</p>
              <div className="flex items-center gap-2">
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${
                  invoice.payment_status === "paid" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                }`}>
                  {invoice.payment_status}
                </span>
                {invoice.payment_method && (
                  <span className="text-gray-600 font-medium">via {invoice.payment_method}</span>
                )}
              </div>
              {invoice.transaction_reference && (
                <p className="text-gray-500 font-mono mt-1">Ref: {invoice.transaction_reference}</p>
              )}
            </div>
          </div>

          {/* Line items table */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 border-b border-gray-200 font-bold text-gray-700 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Item Description</th>
                  <th className="px-4 py-3 text-center">Qty</th>
                  <th className="px-4 py-3 text-right">Unit Price</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-gray-800">
                {(invoice.invoice_items || []).map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{item.name}</p>
                      {item.category && <p className="text-[10px] text-gray-500">{item.category}</p>}
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-medium">{item.quantity}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(item.unit_price)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold">{fmt(item.total_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary / Tax totals */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-t border-gray-200 pt-4 text-xs">
            <div className="space-y-3 flex-1">
              {settings.terms_and_conditions && (
                <div>
                  <p className="font-bold text-gray-700 text-[10px] uppercase tracking-wider mb-1">Terms &amp; Conditions</p>
                  <pre className="whitespace-pre-wrap font-sans text-gray-600 text-[11px] leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-200">
                    {settings.terms_and_conditions}
                  </pre>
                </div>
              )}

              {settings.footer_note && (
                <p className="text-gray-500 italic text-[11px]">{settings.footer_note}</p>
              )}
            </div>

            <div className="w-full sm:w-64 space-y-2 font-mono text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal:</span>
                <span>{fmt(invoice.subtotal)}</span>
              </div>

              {invoice.discount_amount > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Discount:</span>
                  <span>− {fmt(invoice.discount_amount)}</span>
                </div>
              )}

              {settings.issue_tax_invoices && (
                <>
                  <div className="flex justify-between text-gray-600">
                    <span>CGST (9%):</span>
                    <span>{fmt(cgst)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>SGST (9%):</span>
                    <span>{fmt(sgst)}</span>
                  </div>
                  {settings.tax_pricing_mode === "inclusive" && (
                    <p className="text-[10px] text-gray-400 font-sans text-right">
                      (GST extracted from total)
                    </p>
                  )}
                </>
              )}

              <div className="border-t border-gray-300 pt-2 flex justify-between font-bold text-sm text-gray-900">
                <span>Grand Total:</span>
                <span>{fmt(printGrandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
