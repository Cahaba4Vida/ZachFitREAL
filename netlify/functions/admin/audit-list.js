const { requireAuth, isAdmin } = require("../_lib/auth");
const { getGlobalStore } = require("../_lib/store");
const { json, error, withErrorHandling } = require("../_lib/response");
const { asArray } = require("./_lib/utils");

exports.handler = withErrorHandling(async (event) => {
  const { user, error: authError } = await requireAuth(event, context);
  if (authError) return authError;
  if (!isAdmin(user)) return error(403, "Forbidden");
  const store = getGlobalStore();
  const events = asArray(await store.get("auditEvents"), []);
  return json(200, events);
});