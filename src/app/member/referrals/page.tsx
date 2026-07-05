"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ReferralRequest {
  id: string;
  applicant_name: string;
  created_at: string;
}

export default function ReferralsPage() {
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [referralData, setReferralData] = useState<{
    successful_referrals: number;
    reward_eligible: boolean;
    reward_redeemed: boolean;
  } | null>(null);
  const [referredList, setReferredList] = useState<ReferralRequest[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function fetchReferralDetails() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get referral code
        const { data: rc, error: rcError } = await supabase
          .from("referral_codes")
          .select("code, successful_referrals, reward_eligible, reward_redeemed")
          .eq("member_email", user.email?.toLowerCase())
          .maybeSingle();

        if (rcError) throw rcError;

        if (rc) {
          setCode(rc.code);
          setReferralData({
            successful_referrals: rc.successful_referrals,
            reward_eligible: rc.reward_eligible,
            reward_redeemed: rc.reward_redeemed,
          });

          // Get approved referrals
          const { data: list, error: listError } = await supabase
            .from("referral_requests")
            .select("id, applicant_name, created_at")
            .eq("referrer_email", user.email?.toLowerCase())
            .eq("status", "approved")
            .order("created_at", { ascending: false });

          if (listError) throw listError;
          setReferredList(list || []);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load referrals.");
      } finally {
        setLoading(false);
      }
    }

    fetchReferralDetails();
  }, [supabase]);

  const handleCopyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin mb-3" />
        <p className="text-sm text-brand-navy/40">Loading referrals details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-brand-error/10 border border-brand-error/20 text-brand-error rounded-xl text-center">
        {error}
      </div>
    );
  }

  const successCount = referralData?.successful_referrals || 0;
  const targetMet = successCount >= 3;

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-light text-brand-navy">My Referrals</h1>
        <p className="text-sm text-brand-brown-light mt-1">
          Share your code and earn rewards
        </p>
      </div>

      {/* Referral Code Card */}
      <div className="bg-white rounded-2xl border border-brand-sand/50 p-8 text-center space-y-6">
        <h2 className="text-xs font-semibold text-brand-navy/50 uppercase tracking-widest">
          Your Personal Referral Code
        </h2>
        <div className="text-3xl font-mono font-medium tracking-[0.3em] text-brand-navy select-all bg-brand-cream/40 py-4 px-6 rounded-xl border border-brand-sand/30 inline-block uppercase">
          {code}
        </div>
        <div>
          <button
            onClick={handleCopyCode}
            className="px-6 py-2.5 rounded-xl bg-brand-navy text-white font-medium hover:bg-brand-navy/90 transition-all shadow-sm hover:shadow active:scale-[0.98] inline-flex items-center gap-2"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-brand-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                Copy Code
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-brand-navy/40">
          Share this code with friends to invite them to Corhaus Pilates.
        </p>
      </div>

      {/* Progress & Rewards Card */}
      <div className="bg-white rounded-2xl border border-brand-sand/50 p-8 space-y-6">
        <div className="flex justify-between items-baseline">
          <h2 className="text-lg font-medium text-brand-navy">Reward Progress</h2>
          <span className="text-sm font-semibold text-brand-brown">
            {successCount} / 3 Referrals
          </span>
        </div>

        {/* Progress Bar */}
        <div className="flex gap-2 h-2.5">
          {[1, 2, 3].map((stepNum) => (
            <div
              key={stepNum}
              className={`flex-1 h-full rounded-full transition-all duration-500 ${
                successCount >= stepNum ? "bg-brand-brown" : "bg-brand-sand/40"
              }`}
            />
          ))}
        </div>

        {/* Rewards Notice */}
        {referralData?.reward_eligible && !referralData?.reward_redeemed && (
          <div className="p-4 rounded-xl bg-brand-success/10 border border-brand-success/20 text-brand-success flex items-start gap-3 animate-slide-up">
            <span className="text-xl">🎉</span>
            <div>
              <h3 className="font-semibold text-sm">15% Membership Discount Unlocked</h3>
              <p className="text-xs text-brand-success/80 mt-1 leading-relaxed">
                Congratulations! You got a 15% discount. Don't worry, it is reflected in the admin's dashboard and they are monitoring it. You will get your 15% discount.
              </p>
            </div>
          </div>
        )}

        {referralData?.reward_redeemed && (
          <div className="p-4 rounded-xl bg-brand-navy/5 border border-brand-sand text-brand-navy/60 flex items-start gap-3">
            <span className="text-lg">✓</span>
            <div>
              <h3 className="font-semibold text-sm">Discount Redeemed</h3>
              <p className="text-xs text-brand-navy/50 mt-1">
                Your 15% membership discount has been applied and marked as redeemed by the staff.
              </p>
            </div>
          </div>
        )}

        {!targetMet && (
          <p className="text-xs text-brand-navy/50 leading-relaxed">
            Refer <span className="font-semibold text-brand-navy">{3 - successCount} more</span> friends to unlock a 15% membership discount on your next month's membership!
          </p>
        )}
      </div>

      {/* Referred List Card */}
      <div className="bg-white rounded-2xl border border-brand-sand/50 p-8 space-y-6">
        <h2 className="text-lg font-medium text-brand-navy">Invited Friends</h2>

        {referredList.length === 0 ? (
          <div className="text-center py-6 text-brand-navy/40 text-sm">
            No successful referrals yet. Share your code to get started!
          </div>
        ) : (
          <div className="divide-y divide-brand-sand/30">
            {referredList.map((item) => (
              <div key={item.id} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                <div className="w-10 h-10 rounded-full bg-brand-cream border border-brand-sand/50 flex items-center justify-center text-xs font-semibold text-brand-brown">
                  {getInitials(item.applicant_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-navy truncate">
                    {item.applicant_name}
                  </p>
                  <p className="text-xs text-brand-navy/40">
                    Joined on {formatDate(item.created_at)}
                  </p>
                </div>
                <div className="text-xs font-medium text-brand-success bg-brand-success/10 px-2.5 py-1 rounded-full">
                  Successful
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
