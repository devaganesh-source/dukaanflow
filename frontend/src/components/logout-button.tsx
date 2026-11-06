
"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Could not sign out.");
      }

      // Full navigation clears the previous OTP form state.
      window.location.replace("/login");
    } catch {
      setError("Sign out failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#e1e8e1] bg-white px-3 text-sm font-medium text-[#52675a] hover:bg-[#f3f6f2] disabled:opacity-50"
      >
        <LogOut size={16} />
        {busy ? "Signing out..." : "Log out"}
      </button>

      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
