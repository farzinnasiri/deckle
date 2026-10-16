# Feature flags

Features are off unless an operator enables them for a specific Clerk user ID. Assignments live in the Convex user's `features` map. `lib/features.ts` lists the supported features; the initial feature is `ghostwriter`.

The authenticated page loads the user's flags on the server and passes only the resulting booleans to the desk. Signed-out users, unassigned users, and failed flag lookups receive no experimental controls. Refresh the page after changing an assignment.

Ghostwriter also checks its assignment when reserving inference. A hidden button or a modified browser payload cannot grant access. Disabled accounts receive HTTP 403 before a model request or usage reservation. Flag writes are internal Convex mutations, available to deployment operators through the CLI, with no public management endpoint. Login and profile updates preserve assignments; deleting an account removes them with the user row.

Enable a tester on the linked development deployment:

```sh
npx convex run features:set '{"userId":"CLERK_USER_ID","feature":"ghostwriter","enabled":true}'
```

Revoke access:

```sh
npx convex run features:set '{"userId":"CLERK_USER_ID","feature":"ghostwriter","enabled":false}'
```

Inspect the account's effective flags:

```sh
npx convex run features:get '{"userId":"CLERK_USER_ID"}'
```

Use the exact Clerk account ID after checking its identity and sign-in provider. Account identifiers and rollout assignments are deployment data, not hardcoded source configuration. The current repository shares its development Convex deployment with local, preview, and public frontends; these assignments apply to all of them.
