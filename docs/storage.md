# Desk storage

Deckle opens without an account. Signed-out writing uses its own browser-local IndexedDB desk, separate from every account and its offline cloud copy. Papers, notes, replay logs, author and desk settings persist across reloads. This mode never starts cloud initialization, background sync or uploads. Settings → Storage explains local saving and offers optional sign-in for cloud storage.

A new desk offers optional setup using the existing Customize your desk flow. Choosing setup, choosing Start writing, or beginning to write dismisses the invitation for that desk. This choice is saved with the desk and survives reloads. Previously saved desks open normally; guided setup remains available under Settings → Author.

New desks use Cherry, with the room light and both lamps on. Desks without a saved surface choice also use Cherry; existing surface choices are preserved. The lighting lesson temporarily dims the room, then restores its previous state while retaining lamp adjustments. Setup also demonstrates the Notes drawer, daily battery counters and text selection. Practice notes and writing stay outside the saved desk and do not affect activity counts; leaving a lesson restores the original paper.

Signing out returns to the browser-local desk. When a new account has no desk yet, it can explicitly copy the browser desk or start fresh. Copying preserves the original browser papers, leaves cloud saving off, and retains the existing ownership check so another account cannot adopt those papers. An existing account opens its own desk. Archive export and import can move papers between separate desks.

Settings → Storage offers Local and Cloud. Existing browser desks default to Local so enabling cloud storage is an explicit choice. The selection belongs to this browser and account; choosing Local on one device does not change another device's selection.

Local saves the complete desk in account-scoped IndexedDB. Papers are not uploaded. Clearing this browser's site data removes its local copy; the existing archive export remains available as a backup.

Cloud saves the complete desk to Convex: documents, paper options, archive and wastebasket, replay logs, author, settings and daily activity. IndexedDB is the offline copy and durable queue. Opening a cloud desk downloads the latest snapshot when there are no unsaved local changes. Offline changes resume uploading when the browser returns online. There is no idle polling or Notion connection.

Switching to Cloud combines existing local and cloud writing. If the same paper ID has differing content, the remote version is retained as a separate filed paper. A fresh browser opens the cloud desk's active paper. Switching to Local stops uploads and leaves both the browser copy and the previous cloud copy intact. A different device can continue saving to cloud independently.

Cloud snapshots use Convex file storage so large replay logs do not hit the database document-size limit. The current desk row stores an account, file ID, revision, mutation ID and timestamp. The upload goes straight to Convex rather than through the serverless host's request-body limit. Snapshots are capped at 20 MB; exceeding the cap leaves the full local desk intact and displays an error.

Next.js authenticates with Clerk, verifies the request origin and expected account, and calls a server-only Convex HTTP bridge using DECKLE_BRIDGE_SECRET. Uploads use short-lived, one-use tickets tied to an account and origin. Commits accept only that account's uploaded file. An atomic revision check rejects stale saves. Repeated mutation IDs return the same receipt. Abandoned uploads expire after ten minutes. Only the accepted revision advances the browser's queue; newer typing stays pending.

Concurrent edits pause cloud saving and offer Combine both desks. The user can keep working locally. This is snapshot storage with explicit conflict preservation, not simultaneous collaborative editing. Settings in the users table update when a full desk snapshot commits.

Configure the same DECKLE_BRIDGE_SECRET in .env.local / hosting secrets and the Convex deployment. NEXT_PUBLIC_CONVEX_SITE_URL (or server-only CONVEX_SITE_URL) identifies the bridge. The development deployment is updated with npx convex dev --once. Publishing the app still requires production Convex and host configuration.

## Permanent deletion

Settings → Start from scratch opens a confirmation page. The user must type DELETE. Signed-in deletion permanently removes the account's Convex desk snapshots, pending uploads and stored files, profile, settings, and Clerk identity. Cloud rows are gated while deletion is in progress, so late saves cannot repopulate the account. The final mutation removes the temporary gate itself. There is no soft delete, recovery window, deletion audit table or retained copy in Deckle.

Deletion is retriable across an interrupted Clerk/Convex request. A signed, HTTP-only, deletion-only cookie temporarily authorizes the same account's remaining cleanup after Clerk has deleted its identity. It expires after seven days and is removed on success. An incomplete deletion displays an error and a retry action, never success. A pending cleanup returns to the deletion page rather than reopening writing.

Browser cleanup stops writers, closes IndexedDB connections, removes all Deckle databases including legacy and signed-out desks, clears local/session storage and caches, unregisters service workers, expires cookies, signs out, then opens a fresh signed-out desk. Other open tabs pause on the erasure broadcast or a browser-generation change. The response also uses Clear-Site-Data for HTTP caches and storage that JavaScript cannot clear. Accountless deletion performs only browser cleanup. Other users' cloud accounts are never deleted.

The app cannot delete downloaded exports or browser-local copies on other devices. Convex/Clerk infrastructure logs and historical backups are governed by provider retention; this feature does not erase those or promise forensic erasure. Production retention settings and historical backup handling must be managed separately before promising that no provider-held trace remains.
