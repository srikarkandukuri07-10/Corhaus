"use client";

import { useCallback, useEffect, useState } from "react";

export interface BranchLocation {
  id: string;
  name: string;
  slug: string;
  status?: string;
}

/**
 * Active branch for the signed-in user + branches they may switch to.
 * The server derives everything (never trusts client state); switching
 * reloads the page so no stale branch data can linger in any cache.
 */
export function useActiveLocation() {
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [locations, setLocations] = useState<BranchLocation[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/location/active", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json) {
        setActiveLocationId(json.activeLocationId || null);
        setLocations(Array.isArray(json.locations) ? json.locations : []);
      }
    } catch {
      // keep previous state; pages still fail closed via RLS
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const switchLocation = useCallback(async (id: string) => {
    const res = await fetch("/api/location/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId: id }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      throw new Error(json?.error || "You do not have access to this location.");
    }
    window.location.reload();
  }, []);

  return { activeLocationId, locations, loading, refresh, switchLocation };
}
