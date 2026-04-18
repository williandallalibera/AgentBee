"use client";

import { useEffect, useRef } from "react";

/** Ao abrir `/calendar?item=uuid`, rola até o card e destaca uma vez. */
export function CalendarScrollToItem({ itemId }: { itemId: string | null }) {
  const done = useRef(false);
  useEffect(() => {
    if (!itemId?.trim() || done.current) return;
    const el = document.getElementById(`calendar-item-${itemId.trim()}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      done.current = true;
    }
  }, [itemId]);
  return null;
}
