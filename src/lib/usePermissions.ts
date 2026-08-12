"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";

// Global event name used to force a permission refresh across the app.
export const PERMISSIONS_REFRESH_EVENT = "corhaus:permissions-refresh";

// BroadcastChannel name so changes propagate across open tabs.
const PERMISSIONS_CHANNEL = "corhaus-permissions";

/**
 * Requests a re-fetch of the current user's role + permissions.
 * Dispatches a window event so every mounted hook refetches,
 * and broadcasts via BroadcastChannel so other tabs also refresh.
 */
export function refreshPermissions() {
  try {
    window.dispatchEvent(new Event(PERMISSIONS_REFRESH_EVENT));
  } catch (_) {}
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(PERMISSIONS_CHANNEL);
      channel.postMessage("refresh");
      channel.close();
    } catch (_) {}
  }
}

export function usePermissions() {
  const [role, setRole] = useState<string>("");
  const [roleId, setRoleId] = useState<string>("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const lastFetchedKey = useRef<string>("");

  const fetchPerms = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/my-permissions", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const key = `${data.role || ""}|${(data.permissions || []).sort().join(",")}`;
        // Only trigger a re-render if the payload actually changed.
        if (key !== lastFetchedKey.current) {
          lastFetchedKey.current = key;
          setRole(data.role || "");
          setRoleId(data.roleId || "");
          setPermissions(data.permissions || []);
        }
      }
    } catch (err) {
      console.error("Failed to load permissions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPerms();
  }, [pathname, fetchPerms]);

  // Re-fetch whenever a refresh is requested (after role permission edits).
  useEffect(() => {
    window.addEventListener(PERMISSIONS_REFRESH_EVENT, fetchPerms);
    let channel: BroadcastChannel | undefined;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel(PERMISSIONS_CHANNEL);
        channel.onmessage = () => fetchPerms();
      } catch (_) {}
    }
    return () => {
      window.removeEventListener(PERMISSIONS_REFRESH_EVENT, fetchPerms);
      try {
        channel?.close();
      } catch (_) {}
    };
  }, [fetchPerms]);

  const hasPerm = useCallback(
    (actionKey: string) => {
      if (role === "Owner") return true;
      if (permissions.includes("*")) return true;
      return permissions.includes(actionKey);
    },
    [role, permissions]
  );

  return { role, roleId, permissions, loading, hasPerm, refresh: fetchPerms };
}
