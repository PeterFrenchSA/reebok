"use client";

import { useState } from "react";

export function LogoutButton() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onLogout() {
    setIsSubmitting(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.assign("/");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <button type="button" className="btn-secondary" onClick={onLogout} disabled={isSubmitting}>
      {isSubmitting ? "Signing out..." : "Sign Out"}
    </button>
  );
}
