import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { analysis } from "../src/modules/admin/analysis.service.js";

// A9.1: the OpenAI path, with fetch stubbed - no network, no key needed.
const realFetch = globalThis.fetch;
const saved = { ...config };
afterEach(() => {
  globalThis.fetch = realFetch;
  Object.assign(config, saved);
});

const answer = { title: "Payment retries disappear", tags: ["retries"] };
function stub(status, body) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  return calls;
}
const reply = (message, finish_reason = "stop") => ({ choices: [{ message, finish_reason }] });
const useOpenAI = () => Object.assign(config, { aiProvider: "openai", openaiApiKey: "sk-test", openaiModel: "gpt-4o" });
const code = async (promise) => {
  try {
    await promise;
    return "resolved";
  } catch (err) {
    return [err.status, err.code];
  }
};

test("OpenAI: sends the codebase with a strict JSON schema and returns the parsed answer", async () => {
  useOpenAI();
  const calls = stub(200, reply({ content: JSON.stringify(answer) }));
  assert.deepEqual(await analysis.analyze({ "src/a.ts": "export const a = 1;" }), answer);

  const [{ url, init, body }] = calls;
  assert.equal(url, "https://api.openai.com/v1/chat/completions");
  assert.equal(init.headers.Authorization, "Bearer sk-test");
  assert.equal(body.model, "gpt-4o");
  assert.equal(body.messages[0].role, "system");
  assert.match(body.messages[1].content, /<file path="src\/a.ts">\nexport const a = 1;\n<\/file>/);
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  assert.ok(body.response_format.json_schema.schema.required.includes("hidden_files"));
});

test("OpenAI: refusal, cut-off, bad JSON, rejected key and overload map to clear errors", async () => {
  useOpenAI();
  stub(200, reply({ content: null, refusal: "I can't help with that." }));
  assert.deepEqual(await code(analysis.analyze({})), [502, "ANALYSIS_INVALID"]);
  stub(200, reply({ content: '{"title": "cut' }, "length"));
  assert.deepEqual(await code(analysis.analyze({})), [502, "ANALYSIS_INVALID"]);
  stub(200, reply({ content: "not json" }));
  assert.deepEqual(await code(analysis.analyze({})), [502, "ANALYSIS_INVALID"]);
  stub(401, { error: { message: "bad key" } });
  assert.deepEqual(await code(analysis.analyze({})), [502, "ANALYSIS_FAILED"]);
  stub(429, { error: { message: "slow down" } });
  assert.deepEqual(await code(analysis.analyze({})), [503, "ANALYSIS_BUSY"]);
});

test("no provider or no key for the chosen one → 503 ANALYSIS_DISABLED, nothing is sent", async () => {
  const calls = stub(200, reply({ content: "{}" }));
  Object.assign(config, { aiProvider: "", anthropicApiKey: "", openaiApiKey: "" });
  assert.deepEqual(await code(analysis.analyze({})), [503, "ANALYSIS_DISABLED"]);
  Object.assign(config, { aiProvider: "openai", openaiApiKey: "" });
  assert.deepEqual(await code(analysis.analyze({})), [503, "ANALYSIS_DISABLED"]);
  Object.assign(config, { aiProvider: "anthropic", anthropicApiKey: "" });
  assert.deepEqual(await code(analysis.analyze({})), [503, "ANALYSIS_DISABLED"]);
  assert.equal(calls.length, 0);
});
