"use client";

import { useEffect } from "react";

interface ModalProps {
  children: React.ReactNode;
}

/**
 * Modal – a lightweight portal-like wrapper that locks body scroll
 * while open. The children are responsible for their own overlay,
 * centering and sizing.
 */
export default function Modal({ children }: ModalProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return <>{children}</>;
}
