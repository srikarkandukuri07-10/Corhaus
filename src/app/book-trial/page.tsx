"use client";

import { useEffect, useState } from "react";

interface ClassOption {
  id: string;
  title: string;
  instructor: string;
  class_date: string;
  class_time: string;
  max_capacity: number;
  booked_count?: number;
}

export default function BookTrialPage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/trial/classes", { cache: "no-store" });
        const json = await res.json();
        if (res.ok) setClasses(json.classes || []);
        else setError(json.error || "Failed to load classes");
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim() || !phone.trim() || !email.trim() || !selectedClassId) {
      setError("All fields are required.");
      return;
    }
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) { setError("Phone must be 10 digits."); return; }
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email.trim())) { setError("Invalid email."); return; }

    setSubmitting(true);
    try {
      // 1. Create Razorpay order
      const orderRes = await fetch("/api/trial/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName.trim(), phone_number: cleanPhone, email: email.trim().toLowerCase(), class_id: selectedClassId }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error || "Failed to create order");

      // 2. Open Razorpay Checkout
      const options: any = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Corhaus Pilates",
        description: "Trial Class Booking",
        order_id: orderData.orderId,
        handler: async function (response: any) {
          try {
            const verifyRes = await fetch("/api/trial/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                full_name: fullName.trim(),
                phone_number: cleanPhone,
                email: email.trim().toLowerCase(),
                class_id: selectedClassId,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) throw new Error(verifyData.error || "Verification failed");
            setSuccess(true);
          } catch (err: any) {
            setError(err.message || "Payment verification failed");
          } finally {
            setSubmitting(false);
          }
        },
        prefill: { name: fullName, email: email, contact: cleanPhone },
        theme: { color: "#000000" },
        modal: { ondismiss: () => setSubmitting(false) },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", function (response: any) {
        setError(response.error?.description || "Payment failed. Please try again.");
        setSubmitting(false);
      });
      rzp.open();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">✓</div>
          <h2 className="text-2xl font-black">Trial Booked!</h2>
          <p className="text-sm text-gray-600">Your trial has been booked.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <header className="bg-black border-b border-white/10 py-4 px-6">
        <div className="max-w-5xl mx-auto text-white">
          <h1 className="text-2xl font-serif font-bold">Corhaus</h1>
          <p className="text-xs tracking-[0.2em] text-white/70 -mt-1">pilates for everyone</p>
        </div>
      </header>
      <div className="flex-1 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-black text-white text-center">Book Your Trial</h2>
          <p className="text-sm text-white/60 text-center mt-2">Select a real class from our schedule — pay securely via Razorpay Test Mode</p>

          <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 sm:p-8 mt-8 space-y-5 shadow-2xl">
            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">{error}</div>}
            {loading ? <p className="text-xs text-gray-500 text-center">Loading classes...</p> : null}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Full Name <span className="text-red-500">*</span></label>
              <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Ananya Sharma" className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none text-sm text-gray-900 placeholder:text-gray-400 bg-white" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Phone <span className="text-red-500">*</span></label>
                <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="9876543210" maxLength={10} className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none text-sm text-gray-900 placeholder:text-gray-400 bg-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Email <span className="text-red-500">*</span></label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none text-sm text-gray-900 placeholder:text-gray-400 bg-white" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Trial Class <span className="text-red-500">*</span></label>
              <select required value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none text-sm text-gray-900 bg-white">
                <option value="">Select a class</option>
                {classes.map(c => {
                  const spotsLeft = c.max_capacity - (c.booked_count || 0);
                  const isFull = spotsLeft <= 0;
                  return <option key={c.id} value={c.id} disabled={isFull}>{c.title} — {c.class_date} {c.class_time?.substring(0,5)} ({c.instructor}) {isFull ? "— Full" : `— ${spotsLeft} spots left`}</option>;
                })}
              </select>
            </div>

            <button type="submit" disabled={submitting || loading} className="w-full py-4 rounded-xl bg-black text-white font-extrabold text-sm hover:bg-gray-900 disabled:opacity-50">
              {submitting ? "Processing..." : "Pay & Book Trial — Razorpay Test Mode"}
            </button>
            <p className="text-[10px] text-gray-400 text-center">Test payments only. Use Razorpay test cards. No real money is charged.</p>
          </form>
        </div>
      </div>
      {/* Razorpay Checkout script */}
      <script src="https://checkout.razorpay.com/v1/checkout.js" async></script>
    </div>
  );
}
