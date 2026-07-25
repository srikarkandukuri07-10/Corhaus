"use client";

import MembershipFreezeSection from "@/components/membership-freeze-section";

export default function FreezePage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-light text-fg">Membership <span className="font-medium">Freeze</span></h1>
        <p className="text-sm text-fg-4 mt-1">Manage and request temporary holds on your membership</p>
      </div>
      <MembershipFreezeSection />
    </div>
  );
}
