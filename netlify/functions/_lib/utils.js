const parseBody = (event) => {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch (err) {
    return null;
  }
};

const nowIso = () => new Date().toISOString();

/**
 * Coerce an unknown value into an array (or fallback).
 * Prevents runtime crashes when persisted data shapes drift.
 */
const asArray = (value, fallback = []) => (Array.isArray(value) ? value : fallback);

/**
 * Coerce an unknown value into a plain object (or fallback).
 * Excludes arrays/null.
 */
const asObject = (value, fallback = {}) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : fallback;

module.exports = { parseBody, nowIso, asArray, asObject };
