// promptfoo's extension hook (`extensions` in the configs): a fresh journal and project before each
// scenario.
import { reset } from "./fixture.mjs";

export async function extensionHook(hookName) {
  if (hookName === "beforeEach") reset();
}
