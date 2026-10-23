import { requestJSON } from "../api/http.js";
import { cachedQuery, invalidateCached } from "../api/query-cache.js";

const SETTINGS_TTL = 60000;

export const settingsService = {
  get: () => cachedQuery("/settings/me", () => requestJSON("/settings/me"), SETTINGS_TTL),
  update: async (patch) => {
    const result = await requestJSON("/settings/me", {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    // Profile visibility is stored in the profile domain, so both caches are
    // dropped when settings change.
    invalidateCached("/settings/me", "/profile/me", "/dashboard");
    return result;
  }
};
