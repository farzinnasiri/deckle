import type { ReactNode } from "react";
import Link from "next/link";

export function AuthSheet({ children }: { children: ReactNode }) {
  return (
    <main className="auth-desk">
      <section className="auth-sheet" aria-label="Deckle account">
        <header className="auth-heading">
          <Link className="auth-brand" href="/">
            deckle
          </Link>
          <p>Sign in to save your writing across devices.</p>
        </header>
        {children}
        <div className="auth-local">
          <Link className="auth-local-link" href="/">
            Continue without an account
          </Link>
          <p className="auth-note">Saved in this browser. No cloud sync.</p>
        </div>
      </section>
    </main>
  );
}
