"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function TrialForm() {
  const searchParams = useSearchParams();
  const [source, setSource] = useState("Website");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [interest, setInterest] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const src = searchParams.get("source")?.toLowerCase();
    const allowed = ["instagram", "website", "walk-in", "phone", "whatsapp", "referral", "other"];
    if (src && allowed.includes(src)) {
      const map: Record<string, string> = {
        instagram: "Instagram",
        website: "Website",
        "walk-in": "Walk-in",
        phone: "Phone",
        whatsapp: "WhatsApp",
        referral: "Referral",
        other: "Other",
      };
      setSource(map[src] || "Website");
    } else {
      setSource("Website");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) { setError("Full Name is required."); return; }
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) { setError("Phone Number must be exactly 10 digits."); return; }
    if (!email.trim()) { setError("Email is required."); return; }
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email.trim())) { setError("Invalid email format."); return; }
    if (!interest.trim()) { setError("Interest is required."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone_number: cleanPhone,
          email: email.trim(),
          interest: interest.trim(),
          preferred_time: preferredTime.trim() || null,
          message: message.trim() || null,
          source,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit");
      setSuccess(true);
      setFullName(""); setPhone(""); setEmail(""); setInterest(""); setPreferredTime(""); setMessage("");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-2xl font-black text-gray-900">Thank You!</h2>
          <p className="text-sm text-gray-600">Thank you for contacting Corhaus. Our team will get in touch with you shortly.</p>
          <button onClick={() => setSuccess(false)} className="text-sm text-indigo-600 font-bold hover:underline">Submit another enquiry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <header className="bg-black border-b border-white/10 py-4 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="text-white">
            <h1 className="text-2xl font-serif font-bold tracking-tight">Corhaus</h1>
            <p className="text-xs tracking-[0.2em] text-white/70 -mt-1">pilates for everyone</p>
          </div>
          <span className="text-xs text-white/50 hidden sm:block">Trial Enquiry</span>
        </div>
      </header>

      {/* Hero */}
      <div className="flex-1 py-8 sm:py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Book Your Free Trial</h2>
            <p className="text-sm text-white/60 mt-2">Experience Pilates at Corhaus — fill the form and our team will contact you.</p>
            {source === "Instagram" && <span className="inline-block mt-3 text-xs bg-white/10 text-white px-3 py-1 rounded-full">Via Instagram</span>}
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">{error}</div>}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Full Name <span className="text-red-500">*</span></label>
              <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Ananya Sharma" className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none text-sm" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Phone Number <span className="text-red-500">*</span></label>
                <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" maxLength={10} className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none text-sm" />
                <p className="text-[10px] text-gray-400 mt-1">10 digits, Indian number</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Email <span className="text-red-500">*</span></label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Interest <span className="text-red-500">*</span></label>
              <select required value={interest} onChange={(e) => setInterest(e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none text-sm bg-white">
                <option value="">Select your interest</option>
                <option value="Reformer Pilates">Reformer Pilates</option>
                <option value="Mat Pilates">Mat Pilates</option>
                <option value="Private Session">Private Session</option>
                <option value="Group Class">Group Class</option>
                <option value="Membership">Membership</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Preferred Time <span className="text-gray-400 font-normal">(Optional)</span></label>
              <input type="text" value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} placeholder="e.g. Weekday mornings, 7-9 AM" className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none text-sm" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Message / Enquiry <span className="text-gray-400 font-normal">(Optional)</span></label>
              <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us about your fitness goals..." className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black focus:outline-none text-sm resize-none" />
            </div>

            <button type="submit" disabled={loading} className="w-full py-4 rounded-xl bg-black text-white font-extrabold text-sm hover:bg-gray-900 disabled:opacity-50 transition-colors">
              {loading ? "Submitting..." : "Submit Enquiry"}
            </button>

            <p className="text-[10px] text-gray-400 text-center">By submitting, you agree to be contacted by Corhaus.</p>
          </form>
        </div>
      </div>

      <footer className="py-6 text-center text-xs text-white/30">© 2026 Corhaus Pilates — pilates for everyone</footer>
    </div>
  );
}

export default function TrialPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4"><div className="text-white text-sm">Loading...</div></div>}>
      <TrialForm />
    </Suspense>
  );
}
