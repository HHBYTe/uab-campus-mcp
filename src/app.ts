import { requestTimeoutMs, resolveTokenFile } from "./config.js";
import { MoodleClient } from "./moodle-client.js";
import { createServer } from "./server.js";
import { TokenStore } from "./token-store.js";
import { AssignmentSubmission } from "./assignment-submission.js";
import path from "node:path";

export function buildServer(allowAssignmentWrites = false) {
  const tokens = new TokenStore(resolveTokenFile());
  const moodle = new MoodleClient(tokens, requestTimeoutMs());
  const enabled = allowAssignmentWrites && process.env.UAB_ENABLE_ASSIGNMENT_WRITES === "true";
  const auditDir = process.env.UAB_ASSIGNMENT_AUDIT_DIR?.trim();
  if (enabled && (!auditDir || !path.isAbsolute(auditDir))) throw new Error("UAB_ASSIGNMENT_AUDIT_DIR must be an absolute directory when assignment writes are enabled");
  return createServer({ tokens, moodle, ...(enabled && auditDir ? { assignmentSubmission: new AssignmentSubmission(moodle, auditDir) } : {}) });
}
