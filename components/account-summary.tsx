"use client";
import { useClerk, useUser } from "@clerk/nextjs";
import { LogOut } from "lucide-react";

export function AccountSummary() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  if (!isLoaded || !user) return null;
  const email = user.primaryEmailAddress?.emailAddress || "";
  const name = user.fullName || user.username || "Your account";
  return (
    <div className="settings-account">
      <span className="account-avatar" aria-hidden="true">
        {user.hasImage ? (
          <img src={user.imageUrl} alt="" />
        ) : (
          <span>
            {(user.fullName || user.username || email || "D")
              .slice(0, 1)
              .toUpperCase()}
          </span>
        )}
      </span>
      <span className="account-identity">
        <strong>{name}</strong>
        <small>{email}</small>
      </span>
      <button
        className="account-sign-out"
        aria-label="Sign out"
        title="Sign out"
        onClick={() => void signOut({ redirectUrl: "/" })}
      >
        <LogOut size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
