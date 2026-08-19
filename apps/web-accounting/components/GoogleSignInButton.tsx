"use client";

import Script from "next/script";
import { useState } from "react";
import { googleLoginAction } from "@/app/login/actions";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (parent: HTMLElement, options: { theme: string; size: string; width: number; locale: string }) => void;
        };
      };
    };
  }
}

/**
 * Real Google Identity Services integration — "let key, I will input
 * later" pattern (NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID is a placeholder in
 * .env.example/.env.local; real end-to-end Google sign-in needs a real
 * Google Cloud Console OAuth client with localhost:3010 as an authorized
 * origin). The callback receives a real Google id_token, verified
 * server-side by backend-api's real GoogleTokenVerifier (see CLAUDE.md's
 * "Real login" section) — this component never trusts the token itself.
 */
export function GoogleSignInButton() {
  const [error, setError] = useState<string | null>(null);

  const handleCredential = async (response: { credential: string }) => {
    setError(null);
    const result = await googleLoginAction(response.credential);
    if (result?.error) setError(result.error);
  };

  return (
    <div>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => {
          const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
          const container = document.getElementById("google-signin-button");
          if (!clientId || !container || !window.google) return;
          window.google.accounts.id.initialize({ client_id: clientId, callback: handleCredential });
          window.google.accounts.id.renderButton(container, { theme: "outline", size: "large", width: 320, locale: "vi" });
        }}
      />
      <div id="google-signin-button" className="flex justify-center" />
      {error && <p className="mt-2 text-sm text-[var(--color-destructive)]">{error}</p>}
    </div>
  );
}
