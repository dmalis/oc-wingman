import test from "node:test";
import assert from "node:assert/strict";
import { WingmanError, configError, errorMessage } from "../src/core/errors.ts";

test("configError includes code, path, and field", () => {
  const error = configError("Invalid enum", "/tmp/config.json", "exclude");
  assert.equal(error.code, "config.invalid");
  assert.equal(error.path, "/tmp/config.json");
  assert.equal(error.field, "exclude");
  assert.equal(error.message, "Invalid enum at /tmp/config.json field exclude");
});

test("errorMessage preserves WingmanError messages", () => {
  const error = new WingmanError("reviewer.none", "No reviewers remain");
  assert.equal(errorMessage(error), "No reviewers remain");
  assert.equal(errorMessage("plain"), "plain");
});
