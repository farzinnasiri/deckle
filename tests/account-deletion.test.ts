import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deletionReceipt,
  readDeletionReceipt,
  DELETION_COOKIE_AGE,
  permanentlyDeleteAccount,
} from "../lib/account-deletion";

test("deletion retry credentials cannot be forged, modified, or used after expiry", () => {
  const receipt = deletionReceipt("user_a", "test-secret", 1000);
  assert.equal(readDeletionReceipt(receipt, "test-secret", 1001), "user_a");
  assert.equal(readDeletionReceipt(receipt, "other-secret", 1001), null);
  assert.equal(readDeletionReceipt(receipt + "x", "test-secret", 1001), null);
  assert.equal(
    readDeletionReceipt(
      receipt,
      "test-secret",
      1000 + DELETION_COOKIE_AGE * 1000,
    ),
    null,
  );
  const payload = Buffer.from(
    JSON.stringify({ userId: "user_b", expires: 999999 }),
  ).toString("base64url");
  assert.equal(
    readDeletionReceipt(
      `${payload}.${receipt.split(".")[1]}`,
      "test-secret",
      1001,
    ),
    null,
  );
  assert.equal(readDeletionReceipt("invalid", "test-secret", 1001), null);
});

test("permanent deletion waits for cloud batches before deleting identity and finishing", async () => {
  const calls: string[] = [];
  let batch = 0;
  await permanentlyDeleteAccount("user_a", {
    cloud: async (operation, id) => {
      calls.push(`${operation}:${id}`);
      return operation !== "begin-deletion" || ++batch === 2;
    },
    identity: async (id) => {
      calls.push(`identity:${id}`);
    },
  });
  assert.deepEqual(calls, [
    "begin-deletion:user_a",
    "begin-deletion:user_a",
    "identity:user_a",
    "finish-deletion:user_a",
  ]);
});

test("a failure preserves a retry path, including an identity already permanently deleted", async () => {
  let deleted = false;
  let finishAttempts = 0;
  const services = {
    cloud: async (operation: "begin-deletion" | "finish-deletion") => {
      if (operation === "finish-deletion" && ++finishAttempts === 1)
        throw new Error("outage");
      return true;
    },
    identity: async () => {
      if (deleted) throw { status: 404 };
      deleted = true;
    },
  };
  await assert.rejects(permanentlyDeleteAccount("user_a", services), /outage/);
  assert.equal(deleted, true);
  await permanentlyDeleteAccount("user_a", services);
  assert.equal(finishAttempts, 2);
  let identityCalled = false;
  await assert.rejects(
    permanentlyDeleteAccount("user_b", {
      cloud: async () => {
        throw new Error("cloud unavailable");
      },
      identity: async () => {
        identityCalled = true;
      },
    }),
    /cloud unavailable/,
  );
  assert.equal(identityCalled, false);
});
