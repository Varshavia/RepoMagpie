import { test } from "node:test";
import assert from "node:assert/strict";
import { openExternal } from "./open.ts";

// On Windows, cmd expands % even inside quotes, and a " would end the quoted target, so such a target
// is refused before anything runs. (Elsewhere the call would start xdg-open or open, so it isn't run.)
test("on Windows, a target with \" or % is refused before cmd runs", { skip: process.platform !== "win32" && "Windows only" }, async () => {
  for (const target of ["C:\\notes\\%COMSPEC%.md", "C:\\notes\\a\".md", "C:\\notes\\a\r\n.md"]) {
    await assert.rejects(openExternal(target), /can't pass on safely/, JSON.stringify(target));
  }
});
