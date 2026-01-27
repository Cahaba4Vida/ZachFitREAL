const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const { json, error, withErrorHandling } = require("./_lib/response");
const { parseBody, nowIso, asArray } = require("./_lib/utils");

const buildSystemPrompt = (mode) => {
  if (mode === "program_refine") {
    return "You are a strength coach. Provide a minimal JSON patch suggestion for program edits. Keep existing format.";
  }
  return "You are a training coach. Provide a minimal JSON update for today's workout. Keep existing format.";
};

exports.handler = withErrorHandling(async (event, context) => {
  const { user, error: authError } = await requireAuth(event, context);
  if (authError) return authError;
  const body = parseBody(event);
  if (!body?.mode || !body?.prompt) return error(400, "Missing mode or prompt");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return error(500, "Missing OpenAI API key");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const system = buildSystemPrompt(body.mode);
  const payload = {
    model,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `${body.prompt}\n\nContext:\n${JSON.stringify(
          body.mode === "program_refine" ? body.program : body.workout,
          null,
          2
        )}`,
      },
    ],
  };
  // Protect against long-hanging upstream requests (Netlify functions commonly timeout around ~30s).
  const controller = new AbortController();
  const timeoutMs = 25000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      return error(504, "AI request timed out", null, { reason: "AI_TIMEOUT" });
    }
    return error(500, "AI request failed", err?.message || null, { reason: "AI_FETCH_FAILED" });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text();
    return error(502, "AI upstream error", detail, { reason: "AI_UPSTREAM" });
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message?.content || "";
  if (body.mode === "today_adjust") {
    const store = getUserStore(user.userId);
    const revisions = asArray(await store.get("todayAdjustRevisions"), []);
    const entry = {
      createdAt: nowIso(),
      prompt: body.prompt,
      response: message,
    };
    await store.set("todayAdjustRevisions", [entry, ...revisions].slice(0, 10));
  }
  return json(200, { message });
});
