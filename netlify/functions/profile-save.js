const { requireAuth } = require("./_lib/auth");
const { getUserStore, getGlobalStore } = require("./_lib/store");
const { json, error, withErrorHandling } = require("./_lib/response");
const { parseBody, nowIso, asArray, asObject } = require("./_lib/utils");
const db = require("./_lib/db");
const { validateSchema } = require("./_lib/schema");

exports.handler = withErrorHandling(async (event) => {
  let stage = "init";
  try {
  const { user, error: authError } = await requireAuth(event);
  if (authError) return authError;
  stage = "parse_body";
  const body = parseBody(event);
  if (!body) return error(400, "Invalid JSON");
  const store = getUserStore(user.userId);
  stage = "load_profile";
  const existing = asObject(await store.get("profile"), { units: "lb" });
  const profile = {
    ...existing,
    ...body,
    email: user.email,
    updatedAt: nowIso(),
    createdAt: existing.createdAt || nowIso(),
  };
  const { valid } = validateSchema("userProfile", profile);
  if (!valid) {
    return error(400, "Invalid profile schema");
  }
  stage = "save_profile";
  await store.set("profile", profile);
  if (body.onboarding) {
    stage = "db_save_onboarding";
    await db.query(
      `INSERT INTO onboarding (user_id, data, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [user.userId, body.onboarding]
    );
  }
  if (body.units && existing.units && body.units !== existing.units) {
    const convert = body.units === "kg" ? 1 / 2.20462 : 2.20462;
    stage = "load_prs";
    const prs = asArray(await store.get("prs"), []);
    const convertedPrs = prs.map((entry) => ({
      ...entry,
      weight: Number((entry.weight * convert).toFixed(1)),
      estimated1Rm: Number((entry.estimated1Rm * convert).toFixed(1)),
    }));
    await store.set("prs", convertedPrs);
    stage = "load_workouts";
    const workouts = asObject(await store.get("workouts"), {});
    const convertWorkouts = (data) =>
      Object.fromEntries(
        Object.entries(data).map(([date, workout]) => [
          date,
          {
            ...workout,
            exercises: asArray(workout.exercises, []).map((exercise) => ({
              ...exercise,
              logs: asArray(exercise.logs, []).map((log) => ({
                ...log,
                weight: log.weight ? Number((log.weight * convert).toFixed(1)) : log.weight,
              })),
            })),
          },
        ])
      );
    stage = "save_workouts";
    await store.set("workouts", convertWorkouts(workouts));
    stage = "load_workout_logs";
    const logs = asObject(await store.get("workoutLogs"), {});
    stage = "save_workout_logs";
    await store.set("workoutLogs", convertWorkouts(logs));
  }
  const globalStore = getGlobalStore();
  stage = "load_clients";
  const clients = asArray(await globalStore.get("clients"), []);
  const nextClients = [
    {
      userId: user.userId,
      email: user.email,
      lastLogin: profile.updatedAt,
      goal: profile.onboarding?.goal || "",
    },
    ...clients.filter((client) => client.userId !== user.userId),
  ].slice(0, 200);
  await globalStore.set("clients", nextClients);
  return json(200, profile);
  } catch (err) {
    err.stage = stage;
    throw err;
  }
});