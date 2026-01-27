const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const { json, withErrorHandling } = require("./_lib/response");
const { asArray } = require("./_lib/utils");

exports.handler = withErrorHandling(async (event) => {
  const { user, error } = await requireAuth(event, context);
  if (error) return error;
  const store = getUserStore(user.userId);
  const prs = asArray(await store.get("prs"), []);
  return json(200, prs);
});