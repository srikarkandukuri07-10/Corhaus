"use client";

import { useEffect } from "react";

// Locks background page scroll while a modal/dialog is open and restores it
// on close. Safe to call in multiple mounted components — a module-level
// counter keeps the lock until the last modal closes.
let lockCount = 0;
let prevOverflow = "";

export function useLockBody(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof document === "undefined") return;
    if (lockCount === 0) {
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    lockCount += 1;
    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.body.style.overflow = prevOverflow;
      }
    };
  }, [locked]);
}
