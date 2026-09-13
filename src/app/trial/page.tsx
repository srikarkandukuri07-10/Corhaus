"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function EnquiryForm() {
  const searchParams = useSearchParams();
  const isInstagram = searchParams.get("source")?.toLowerCase() === "instagram";
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) { setError("Full Name is required."); return; }
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) { setError("Phone Number must be exactly 10 digits."); return; }
    if (!email.trim()) { setError("Email is required."); return; }
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email.trim())) { setError("Invalid email format."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone_number: cleanPhone,
          email: email.trim(),
          message: message.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit");
      setSuccess(true);
      setFullName(""); setPhone(""); setEmail(""); setMessage("");
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
          <p className="text-sm text-gray-600">Thank you! Your enquiry has been submitted. Our team will get back to you soon.</p>
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
          <span className="text-xs text-white/50 hidden sm:block">Enquiry</span>
        </div>
      </header>

      {/* Hero */}
      <div className="flex-1 py-8 sm:py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Get in Touch</h2>
            <p className="text-sm text-white/60 mt-2">Have a question or interested in Corhaus? Fill out the form and our team will get back to you.</p>
            {isInstagram && <span className="inline-block mt-3 text-xs bg-white/10 text-white px-3 py-1 rounded-full">Via Instagram</span>}
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">{error}</div>}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Full Name <span className="text-red-500">*</span></label>
              <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Ananya Sharma" className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-white focus:border-black focus:outline-none text-sm !text-gray-900 placeholder:text-gray-400" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Phone Number <span className="text-red-500">*</span></label>
                <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" maxLength={10} className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-white focus:border-black focus:outline-none text-sm !text-gray-900 placeholder:text-gray-400" />
                <p className="text-[10px] text-gray-400 mt-1">10 digits, Indian number</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Email <span className="text-red-500">*</span></label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-white focus:border-black focus:outline-none text-sm !text-gray-900 placeholder:text-gray-400" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Message / Enquiry</label>
              <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us how we can help you..." className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-white focus:border-black focus:outline-none text-sm !text-gray-900 placeholder:text-gray-400 resize-none" />
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
      <EnquiryForm />
    </Suspense>
  );
}
