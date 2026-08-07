"use client";

import { useEffect, useState } from "react";

export function usePermissions() {
  const [role, setRole] = useState<string>("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPerms() {
      try {
        const res = await fetch("/api/admin/my-permissions");
        if (res.ok) {
          const data = await res.json();
          setRole(data.role || "");
          setPermissions(data.permissions || []);
        }
      } catch (err) {
        console.error("Failed to load permissions:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchPerms();
  }, []);

  const hasPerm = (actionKey: string) => {
    if (role === "Manager") return true;
    return permissions.includes(actionKey);
  };

  return { role, permissions, loading, hasPerm };
}
