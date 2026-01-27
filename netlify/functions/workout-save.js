const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const { json, error, withErrorHandling } = require("./_lib/response");
const { parseBody, asObject } = require("./_lib/utils");
const { validateSchema } = require("./_lib/schema");

exports.handler = withErrorHandling(async (event) => {
  const { user, error: authError } = await requireAuth(event, context);
  if (authError) return authError;
  const date = event.queryStringParameters?.date;
  if (!date) return error(400, "Missing date");
  const body = parseBody(event);
  if (!body?.workout) return error(400, "Missing workout");
  const { date: _ignoredDate, ...workoutNoDate } = body.workout || {};
  const { valid } = validateSchema("workoutDay", workoutNoDate);
  if (!valid) return error(400, "Invalid workout schema");
  const store = getUserStore(user.userId);
  const workouts = asObject(await store.get("workouts"), {});
  workouts[date] = { ...workoutNoDate, date };
  await store.set("workouts", workouts);
  return json(200, workouts[date]);
});
