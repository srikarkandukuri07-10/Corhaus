"use client";

import { useEffect, useState, useMemo } from "react";

interface ClassOption {
  id: string;
  title: string;
  instructor: string;
  class_date: string;
  class_time: string;
  max_capacity: number;
  booked_count?: number;
}

const TIME_SLOTS = [
  { label: "6:00 - 7:00 AM", value: "06:00", period: "Morning" },
  { label: "7:00 - 8:00 AM", value: "07:00", period: "Morning" },
  { label: "8:00 - 9:00 AM", value: "08:00", period: "Morning" },
  { label: "9:00 - 10:00 AM", value: "09:00", period: "Morning" },
  { label: "4:00 - 5:00 PM", value: "16:00", period: "Evening" },
  { label: "5:00 - 6:00 PM", value: "17:00", period: "Evening" },
  { label: "6:00 - 7:00 PM", value: "18:00", period: "Evening" },
  { label: "7:00 - 8:00 PM", value: "19:00", period: "Evening" },
];

export default function BookTrialPage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  });
  const [selectedSlot, setSelectedSlot] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const upcomingDates = useMemo(() => {
    const dates = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const iso = d.toISOString().split("T")[0];
      const label = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
      dates.push({ iso, label });
    }
    return dates;
  }, []);

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

  const getSlotAvailability = (date: string, time: string) => {
    const cls = classes.find(c => c.class_date === date && c.class_time?.startsWith(time));
    if (!cls) return { available: true, spotsLeft: 10, isNew: true };
    const spotsLeft = cls.max_capacity - (cls.booked_count || 0);
    return { available: spotsLeft > 0, spotsLeft, isNew: false, cls };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim() || !phone.trim() || !email.trim() || !selectedDate || !selectedSlot) {
      setError("All fields and a time slot are required.");
      return;
    }
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) { setError("Phone must be 10 digits."); return; }
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email.trim())) { setError("Invalid email."); return; }

    const slotInfo = getSlotAvailability(selectedDate, selectedSlot);
    const targetClass = (slotInfo as any).cls;
    const classId = targetClass?.id || null;

    // If no class exists for that slot, we will create a trial with that date/time and let the backend handle it
    // For now, we need a classId, so if no class, we create a trial with the selected date/time and a default title
    setSubmitting(true);
    try {
      const orderRes = await fetch("/api/trial/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone_number: cleanPhone,
          email: email.trim().toLowerCase(),
          class_id: classId,
          trial_date: selectedDate,
          trial_time: selectedSlot,
          class_name: selectedSlot.startsWith("16") || selectedSlot.startsWith("17") || selectedSlot.startsWith("18") || selectedSlot.startsWith("19") ? "Evening Reformer" : "Morning Reformer",
        }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error || "Failed to create order");

      const options: any = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Corhaus Pilates",
        description: `Trial - ${selectedDate} ${selectedSlot}`,
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
                class_id: classId,
                trial_date: selectedDate,
                trial_time: selectedSlot,
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
          <p className="text-xs text-gray-500">{selectedDate} at {selectedSlot} — {parseInt(selectedSlot) < 12 ? "Morning" : "Evening"} Reformer</p>
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
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-black text-white text-center">Book Your Trial</h2>
          <p className="text-sm text-white/60 text-center mt-2">Choose any upcoming date and a time slot — pay securely via Razorpay Test Mode</p>

          <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 sm:p-8 mt-8 space-y-6 shadow-2xl">
            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">{error}</div>}
            {loading ? <p className="text-xs text-gray-500 text-center">Loading availability...</p> : null}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Full Name <span className="text-red-500">*</span></label>
                <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Ananya Sharma" className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none text-sm text-gray-900 placeholder:text-gray-400 bg-white" />
              </div>
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
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Select Date <span className="text-red-500">*</span></label>
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {upcomingDates.map(d => (
                  <button key={d.iso} type="button" onClick={() => setSelectedDate(d.iso)} className={`px-4 py-3 rounded-xl border-2 text-xs font-bold whitespace-nowrap ${selectedDate === d.iso ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-200 hover:border-black"}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Morning Reformer — 6 AM to 10 AM <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {TIME_SLOTS.filter(s => s.period === "Morning").map(slot => {
                  const avail = getSlotAvailability(selectedDate, slot.value);
                  const isSelected = selectedSlot === slot.value;
                  return (
                    <button key={slot.value} type="button" onClick={() => setSelectedSlot(slot.value)} className={`p-3 rounded-xl border-2 text-xs font-bold ${isSelected ? "bg-black text-white border-black" : avail.available ? "bg-white text-gray-900 border-gray-200 hover:border-black" : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"}`}>
                      <div>{slot.label}</div>
                      <div className="text-[10px] font-normal mt-1">{avail.available ? `${avail.spotsLeft} spots left` : "Full"}{avail.isNew ? " • New" : ""}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Evening Reformer — 4 PM to 8 PM <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {TIME_SLOTS.filter(s => s.period === "Evening").map(slot => {
                  const avail = getSlotAvailability(selectedDate, slot.value);
                  const isSelected = selectedSlot === slot.value;
                  return (
                    <button key={slot.value} type="button" onClick={() => setSelectedSlot(slot.value)} className={`p-3 rounded-xl border-2 text-xs font-bold ${isSelected ? "bg-black text-white border-black" : avail.available ? "bg-white text-gray-900 border-gray-200 hover:border-black" : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"}`}>
                      <div>{slot.label}</div>
                      <div className="text-[10px] font-normal mt-1">{avail.available ? `${avail.spotsLeft} spots left` : "Full"}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button type="submit" disabled={submitting || loading || !selectedSlot} className="w-full py-4 rounded-xl bg-black text-white font-extrabold text-sm hover:bg-gray-900 disabled:opacity-50">
              {submitting ? "Processing..." : "Pay & Book Trial — Razorpay Test Mode"}
            </button>
            <p className="text-[10px] text-gray-400 text-center">Test payments only. Use Razorpay test cards. No real money is charged.</p>
          </form>
        </div>
      </div>
      <script src="https://checkout.razorpay.com/v1/checkout.js" async></script>
    </div>
  );
}
