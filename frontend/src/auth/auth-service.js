import { requestJSON } from "../api/http.js";
import { cachedQuery, clearQueryCache, invalidateCached } from "../api/query-cache.js";

export const authService = {
  // Signing in can change which account the browser is showing, so every
  // cached response from the previous account is dropped first.
  register: async (email, password) => {
    const result = await requestJSON("/auth/register", {
      method: "POST", body: JSON.stringify({ email, password })
    });
    clearQueryCache();
    return result;
  },
  login: async (email, password) => {
    const result = await requestJSON("/auth/login", {
      method: "POST", body: JSON.stringify({ email, password })
    });
    clearQueryCache();
    return result;
  },
  me: () => cachedQuery("/auth/me", () => requestJSON("/auth/me"), 30000),
  logout: async () => {
    const result = await requestJSON("/auth/logout", { method: "POST" });
    invalidateCached("/auth/me", "/profile/me", "/dashboard");
    return result;
  }
};
