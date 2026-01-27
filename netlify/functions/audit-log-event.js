const { requireAuth } = require("./_lib/auth");
const { getGlobalStore } = require("./_lib/store");
const { json, error, withErrorHandling } = require("./_lib/response");
const { parseBody, nowIso, asArray } = require("./_lib/utils");
const { validateSchema } = require("./_lib/schema");

exports.handler = withErrorHandling(async (event, context) => {
  let stage = "init";
  try {
  const { user, error: authError } = await requireAuth(event, context);
  if (authError) return authError;
  stage = "parse_body";
  const body = parseBody(event);
  if (!body?.type) return error(400, "Missing event type");
  const entry = {
    type: body.type,
    detail: body.detail || "",
    createdAt: nowIso(),
    userId: user.userId,
    email: user.email,
  };
  const { valid } = validateSchema("auditEvent", entry);
  if (!valid) return error(400, "Invalid audit schema");
  const store = getGlobalStore();
  stage = "load_audit_events";
  const events = asArray(await store.get("auditEvents"), []);
  const next = [entry, ...events].slice(0, 200);
  stage = "save_audit_events";
  await store.set("auditEvents", next);
  return json(200, entry);
  } catch (err) {
    err.stage = stage;
    throw err;
  }
});
