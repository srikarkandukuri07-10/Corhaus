"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function ForgotCallbackPage() {
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) {
      router.replace("/auth/login");
      return;
    }

    const params = new URLSearchParams(hash.replace("#", ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      router.replace("/auth/login");
      return;
    }

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          router.replace("/auth/login");
        } else {
          window.location.href = "/member";
        }
      });
  }, [supabase, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-2">
      <div className="w-8 h-8 border-2 border-accent/30 border-t-text-gold rounded-full animate-spin" />
    </div>
  );
}
