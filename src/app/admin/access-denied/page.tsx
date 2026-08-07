"use client";

import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in px-4">
      <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 mb-6">
        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>

      <h1 className="font-serif text-3xl font-bold text-fg mb-3">Access Denied</h1>
      <p className="text-sm text-fg-3 max-w-md leading-relaxed mb-8">
        Your account role does not have the required permissions to view this module. Please contact the studio Manager to request access.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center w-full max-w-xs">
        <Link
          href="/admin"
          className="admin-button admin-button-primary w-full"
        >
          Return to Dashboard
        </Link>
        <button
          onClick={() => window.location.reload()}
          className="admin-button admin-button-secondary w-full"
        >
          Refresh Page
        </button>
      </div>
    </div>
  );
}
