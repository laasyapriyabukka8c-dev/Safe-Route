const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_PREFERENCES = Object.freeze({
  appearance: "light",
  mapView: "network",
  showHospitals: true,
  showRoads: true,
  notifyIncidents: true,
  facilityType: "hospital",
  routePreference: "fastest",
  emergencyPriority: "standard"
});

function createPreferencesStore(dataDirectory) {
  const preferencesFile = path.join(dataDirectory, "preferences.json");
  let writeQueue = Promise.resolve();

  async function readAll() {
    try {
      const stored = JSON.parse(await fs.readFile(preferencesFile, "utf8"));
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
        throw new Error("Preferences store must contain a JSON object.");
      }
      return stored;
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw new Error(`Unable to load preferences: ${error.message}`);
    }
  }

  async function get(userId) {
    const stored = await readAll();
    return { ...DEFAULT_PREFERENCES, ...(stored[userId] || {}) };
  }

  async function update(userId, patch) {
    const operation = writeQueue.then(async () => {
      const stored = await readAll();
      const merged = { ...DEFAULT_PREFERENCES, ...(stored[userId] || {}), ...patch };
      stored[userId] = merged;

      await fs.mkdir(dataDirectory, { recursive: true });
      const temporaryFile = `${preferencesFile}.${process.pid}.tmp`;
      try {
        await fs.writeFile(temporaryFile, JSON.stringify(stored, null, 2), {
          encoding: "utf8",
          mode: 0o600
        });
        await fs.rename(temporaryFile, preferencesFile);
      } catch (error) {
        await fs.rm(temporaryFile, { force: true });
        throw error;
      }
      return merged;
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  return { get, update };
}

module.exports = { createPreferencesStore, DEFAULT_PREFERENCES };
