import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { createServer } from "../src/server.js";
import type { MoodleClient } from "../src/moodle-client.js";
import type { TokenStore } from "../src/token-store.js";

test("download tools resolve file metadata and reject mismatched submissions", async () => {
  let owner = 42;
  let downloads = 0;
  const moodle = {
    async call(_year: string, fn: string) {
      if (fn === "core_course_get_contents") return [{ modules: [{ id: 7, contents: [{ filename: "a.bin", filesize: 3, fileurl: "https://e-aules.uab.cat/2026-27/pluginfile.php/1/a.bin" }] }] }];
      if (fn === "core_webservice_get_site_info") return { userid: 42 };
      if (fn === "mod_assign_get_submission_status") return { lastattempt: { submission: { id: 4, assignment: 8, userid: owner, status: "submitted", plugins: [{ fileareas: [{ files: [{ filename: "b.bin", filesize: 3, fileurl: "https://e-aules.uab.cat/2026-27/pluginfile.php/2/b.bin" }] }] }] } } };
      throw new Error("Unexpected function");
    },
    async fetchFile(_year: string, _url: string, maxBytes: number) {
      downloads++;
      if (maxBytes < 3) throw new Error("exceeds maxBytes");
      return { content: new Uint8Array([0, 1, 255]), mediaType: "application/octet-stream" };
    },
  } as unknown as MoodleClient;
  const server = createServer({ moodle, tokens: {} as TokenStore });
  const client = new Client({ name: "download-test", version: "1" });
  class LocalTransport {
    peer?: LocalTransport;
    onmessage?: (message: never) => void;
    onclose?: () => void;
    async start() {}
    async send(message: never) { queueMicrotask(() => this.peer?.onmessage?.(message)); }
    async close() { this.onclose?.(); }
  }
  const clientTransport = new LocalTransport();
  const serverTransport = new LocalTransport();
  clientTransport.peer = serverTransport;
  serverTransport.peer = clientTransport;
  await Promise.all([server.connect(serverTransport as never), client.connect(clientTransport as never)]);
  try {
    const resource = await client.callTool({ name: "campus_download_resource", arguments: { year: "2026-27", courseId: 1, moduleId: 7, fileIndex: 0 } });
    assert.equal((resource.structuredContent?.data as { content: string }).content, "AAH/");
    const args = { year: "2026-27", assignmentId: 8, submissionId: 4, pluginIndex: 0, areaIndex: 0, fileIndex: 0 };
    const submission = await client.callTool({ name: "campus_download_submission_file", arguments: args });
    assert.equal((submission.structuredContent?.data as { content: string }).content, "AAH/");
    owner = 99;
    const denied = await client.callTool({ name: "campus_download_submission_file", arguments: args });
    assert.equal(denied.isError, true);
    assert.equal(downloads, 2);
    const tooSmall = await client.callTool({ name: "campus_download_resource", arguments: { year: "2026-27", courseId: 1, moduleId: 7, fileIndex: 0, maxBytes: 2 } });
    assert.equal(tooSmall.isError, true);
    assert.equal(downloads, 2);
  } finally {
    await client.close();
    await server.close();
  }
});

test("assignment attachments are resolved through the assignment API", async () => {
  const fetched: string[] = [];
  const moodle = {
    async call(_year: string, fn: string) {
      if (fn === "mod_assign_get_assignments") {
        return { courses: [{ assignments: [{ id: 8, introattachments: [
          { filename: "main.c", filesize: 18, mimetype: "text/plain", fileurl: "https://e-aules.uab.cat/2026-27/webservice/pluginfile.php/5/mod_assign/introattachment/0/main.c" },
          { filename: "evil.c", filesize: 1, fileurl: "https://e-aules.uab.cat/2026-27/webservice/pluginfile.php/5/mod_resource/content/1/evil.c" },
        ] }] }] };
      }
      throw new Error("Unexpected function");
    },
    async fetchFile(_year: string, url: string) {
      fetched.push(url);
      return { content: new TextEncoder().encode("int main(void) {}\n"), mediaType: "text/plain" };
    },
  } as unknown as MoodleClient;
  const server = createServer({ moodle, tokens: {} as TokenStore });
  const client = new Client({ name: "attachment-test", version: "1" });
  class LocalTransport {
    peer?: LocalTransport;
    onmessage?: (message: never) => void;
    onclose?: () => void;
    async start() {}
    async send(message: never) { queueMicrotask(() => this.peer?.onmessage?.(message)); }
    async close() { this.onclose?.(); }
  }
  const clientTransport = new LocalTransport();
  const serverTransport = new LocalTransport();
  clientTransport.peer = serverTransport;
  serverTransport.peer = clientTransport;
  await Promise.all([server.connect(serverTransport as never), client.connect(clientTransport as never)]);
  try {
    const base = { year: "2026-27", courseId: 1, assignmentId: 8 };
    const ok = await client.callTool({ name: "campus_read_assignment_attachment", arguments: { ...base, fileIndex: 0 } });
    const data = ok.structuredContent?.data as { filename: string; text: string; readable: boolean };
    assert.equal(data.filename, "main.c");
    assert.equal(data.readable, true);
    assert.match(data.text, /int main/);
    const wrongArea = await client.callTool({ name: "campus_read_assignment_attachment", arguments: { ...base, fileIndex: 1 } });
    assert.equal(wrongArea.isError, true);
    const missing = await client.callTool({ name: "campus_read_assignment_attachment", arguments: { ...base, assignmentId: 9, fileIndex: 0 } });
    assert.equal(missing.isError, true);
    assert.equal(fetched.length, 1);
  } finally {
    await client.close();
    await server.close();
  }
});
