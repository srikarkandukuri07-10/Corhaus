"use client";

import { useEffect, useState, useCallback, useMemo } from "react";

interface RoleItem {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  enabled_permissions_count: number;
  total_permissions_count: number;
  staff_count: number;
}

interface PermissionItem {
  id: string;
  module: string;
  action_key: string;
  name: string;
  description: string;
}

export default function RolesPermissionsPage() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor State
  const [selectedRole, setSelectedRole] = useState<RoleItem | null>(null);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [selectedPermIds, setSelectedPermIds] = useState<Set<string>>(new Set());
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>({});
  
  const [editorLoading, setEditorLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // 1. Fetch Roles
  const fetchRoles = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/roles");
      const data = await res.json();
      if (res.ok && data.roles) {
        setRoles(data.roles);
      } else {
        setError(data.error || "Failed to load roles");
      }
    } catch (err) {
      setError("Failed to fetch roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // 2. Open Role Permissions Editor
  const handleOpenPermissions = async (role: RoleItem) => {
    try {
      setSelectedRole(role);
      setEditorLoading(true);
      setSaveSuccess(null);
      setError(null);

      const res = await fetch(`/api/admin/roles/${role.id}/permissions`);
      const data = await res.json();

      if (res.ok && data.permissions) {
        setPermissions(data.permissions);
        setSelectedPermIds(new Set(data.assigned_permission_ids || []));
      } else {
        setError(data.error || "Failed to load role permissions");
      }
    } catch (err) {
      setError("Error opening role permissions editor");
    } finally {
      setEditorLoading(false);
    }
  };

  // Group permissions by module
  const groupedPermissions = useMemo(() => {
    const map: Record<string, PermissionItem[]> = {};
    permissions.forEach((p) => {
      if (!map[p.module]) map[p.module] = [];
      map[p.module].push(p);
    });
    return map;
  }, [permissions]);

  const moduleNames = useMemo(() => Object.keys(groupedPermissions), [groupedPermissions]);

  // Toggle individual permission
  const togglePermission = (permId: string) => {
    if (selectedRole?.name === "Owner") return; // Owner locked
    setSelectedPermIds((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  };

  // Toggle all permissions for a module
  const toggleModuleAll = (moduleName: string) => {
    if (selectedRole?.name === "Owner") return;
    const modulePerms = groupedPermissions[moduleName] || [];
    const allSelected = modulePerms.every((p) => selectedPermIds.has(p.id));

    setSelectedPermIds((prev) => {
      const next = new Set(prev);
      modulePerms.forEach((p) => {
        if (allSelected) next.delete(p.id);
        else next.add(p.id);
      });
      return next;
    });
  };

  // Toggle all permissions globally
  const handleSelectAllGlobal = () => {
    if (selectedRole?.name === "Owner") return;
    const allIds = permissions.map((p) => p.id);
    setSelectedPermIds(new Set(allIds));
  };

  const handleClearAllGlobal = () => {
    if (selectedRole?.name === "Owner") return;
    setSelectedPermIds(new Set());
  };

  // Toggle module collapse
  const toggleModuleCollapse = (moduleName: string) => {
    setCollapsedModules((prev) => ({ ...prev, [moduleName]: !prev[moduleName] }));
  };

  // Save Role Permissions
  const handleSaveChanges = async () => {
    if (!selectedRole) return;
    try {
      setSaving(true);
      setSaveSuccess(null);
      setError(null);

      const res = await fetch(`/api/admin/roles/${selectedRole.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permission_ids: Array.from(selectedPermIds),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSaveSuccess(`Permissions for ${selectedRole.name} saved successfully!`);
        fetchRoles(); // Refresh role counts
        setTimeout(() => setSaveSuccess(null), 4000);
      } else {
        setError(data.error || "Failed to save permissions");
      }
    } catch (err) {
      setError("Failed to connect to server");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 text-fg">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-accent/10 text-accent rounded-xl">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </span>
            <h1 className="font-serif text-2xl font-bold text-fg">Role &amp; Permissions</h1>
          </div>
          <p className="text-xs text-fg-3 mt-1">
            Central management for system roles and action-based module permissions across Corhaus Admin Dashboard.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-fg">✕</button>
        </div>
      )}

      {saveSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>{saveSuccess}</span>
        </div>
      )}

      {/* OVERVIEW CARDS LIST OR EDITOR */}
      {!selectedRole ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-fg-3">
              System Roles ({roles.length})
            </h2>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-44 bg-surface rounded-2xl border border-line animate-pulse p-6" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {roles.map((role) => {
                const isOwner = role.name === "Owner";
                return (
                  <div
                    key={role.id}
                    className="bg-surface border border-line rounded-2xl p-6 flex flex-col justify-between space-y-4 hover:border-accent/40 transition-all shadow-xs"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-serif text-lg font-bold text-fg flex items-center gap-2">
                          {role.name}
                          {isOwner && (
                            <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] font-extrabold uppercase">
                              All Permissions Enabled
                            </span>
                          )}
                        </h3>
                        <span className="px-2.5 py-1 rounded-lg bg-surface-2 text-fg-3 text-xs font-semibold border border-line-2">
                          {role.staff_count} Staff
                        </span>
                      </div>
                      <p className="text-xs text-fg-3 leading-relaxed">
                        {role.description || "Default system role."}
                      </p>
                    </div>

                    <div className="pt-4 border-t border-line flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-fg-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>
                          {role.enabled_permissions_count} / {role.total_permissions_count} permissions
                        </span>
                      </div>
                      <button
                        onClick={() => handleOpenPermissions(role)}
                        className="px-4 py-2 rounded-xl bg-accent text-white font-bold text-xs hover:bg-accent-2 transition-colors shadow-xs"
                      >
                        View Permissions
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* GRANULAR PERMISSION EDITOR SCREEN */
        <div className="space-y-6">
          {/* EDITOR BAR */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-5 rounded-2xl border border-line shadow-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedRole(null)}
                className="p-2 rounded-xl bg-surface-2 hover:bg-hover border border-line text-fg-3 hover:text-fg text-xs font-bold flex items-center gap-1"
              >
                ← Back to Roles
              </button>
              <div>
                <h2 className="font-serif text-xl font-bold text-fg">
                  {selectedRole.name} Permissions
                </h2>
                <p className="text-xs text-fg-3">
                  {selectedRole.name === "Owner"
                    ? "Owner role automatically receives 100% full permissions."
                    : `${selectedPermIds.size} of ${permissions.length} permissions enabled.`}
                </p>
              </div>
            </div>

            {selectedRole.name !== "Owner" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllGlobal}
                  className="px-3 py-1.5 rounded-xl bg-surface-2 border border-line text-xs font-semibold text-fg hover:bg-hover"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleClearAllGlobal}
                  className="px-3 py-1.5 rounded-xl bg-surface-2 border border-line text-xs font-semibold text-fg-3 hover:bg-hover"
                >
                  Clear All
                </button>
              </div>
            )}
          </div>

          {editorLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-surface rounded-2xl border border-line animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {moduleNames.map((modName) => {
                const modPerms = groupedPermissions[modName] || [];
                const enabledInMod = modPerms.filter((p) => selectedPermIds.has(p.id)).length;
                const isAllSelected = modPerms.length > 0 && enabledInMod === modPerms.length;
                const isCollapsed = Boolean(collapsedModules[modName]);

                return (
                  <div
                    key={modName}
                    className="bg-surface border border-line rounded-2xl overflow-hidden shadow-xs transition-all"
                  >
                    {/* MODULE CARD HEADER */}
                    <div className="p-4 bg-surface-2/50 flex items-center justify-between border-b border-line">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          disabled={selectedRole.name === "Owner"}
                          checked={isAllSelected}
                          onChange={() => toggleModuleAll(modName)}
                          className="w-4 h-4 accent-accent rounded cursor-pointer disabled:opacity-50"
                        />
                        <h3 className="text-sm font-bold text-fg tracking-wide">
                          {modName}
                        </h3>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-0.5 rounded-full bg-surface text-fg-3 text-[11px] font-bold border border-line">
                          {enabledInMod}/{modPerms.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleModuleCollapse(modName)}
                          className="p-1 rounded-lg hover:bg-hover text-fg-3 hover:text-fg text-xs font-bold"
                        >
                          {isCollapsed ? "▼" : "▲"}
                        </button>
                      </div>
                    </div>

                    {/* MODULE PERMISSIONS BODY */}
                    {!isCollapsed && (
                      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {modPerms.map((perm) => {
                          const isChecked = selectedPermIds.has(perm.id);
                          return (
                            <label
                              key={perm.id}
                              className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                                isChecked
                                  ? "bg-accent/5 border-accent/30"
                                  : "bg-surface border-line/60 hover:border-line"
                              } ${selectedRole.name === "Owner" ? "cursor-not-allowed opacity-80" : ""}`}
                            >
                              <input
                                type="checkbox"
                                disabled={selectedRole.name === "Owner"}
                                checked={isChecked}
                                onChange={() => togglePermission(perm.id)}
                                className="w-4 h-4 accent-accent rounded mt-0.5 flex-shrink-0"
                              />
                              <div className="space-y-0.5 min-w-0">
                                <p className="text-xs font-bold text-fg leading-tight">
                                  {perm.name}
                                </p>
                                <p className="text-[11px] text-fg-3 leading-snug">
                                  {perm.description}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* STICKY BOTTOM SAVE ACTION BAR */}
          {selectedRole.name !== "Owner" && (
            <div className="sticky bottom-4 z-40 bg-surface border border-line rounded-2xl p-4 shadow-xl flex items-center justify-between gap-4">
              <span className="text-xs font-medium text-fg-3">
                Changes will take effect immediately upon saving.
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedRole(null)}
                  className="px-4 py-2 rounded-xl bg-surface-2 border border-line text-xs font-semibold text-fg hover:bg-hover"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveChanges}
                  disabled={saving}
                  className="px-6 py-2 rounded-xl bg-accent text-white font-bold text-xs hover:bg-accent-2 disabled:opacity-50 shadow-md shadow-accent/20 flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
