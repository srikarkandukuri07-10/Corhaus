"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  children: React.ReactNode;
}

/**
 * Modal – renders children via a React Portal directly on document.body,
 * bypassing any parent transform / filter / backdrop-filter stacking context
 * that would break `position: fixed` centering.
 * Also locks body scroll while open.
 */
export default function Modal({ children }: ModalProps) {
  const portalRef = useRef<HTMLDivElement | null>(null);

  if (typeof document !== "undefined" && !portalRef.current) {
    portalRef.current = document.createElement("div");
    portalRef.current.id = "modal-portal";
  }

  useEffect(() => {
    const el = portalRef.current;
    if (!el) return;
    document.body.appendChild(el);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
      if (document.body.contains(el)) {
        document.body.removeChild(el);
      }
    };
  }, []);

  if (!portalRef.current) return null;
  return createPortal(children, portalRef.current);
}
