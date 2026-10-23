import { requestJSON } from "../api/http.js";
import { cachedQuery, invalidateCached } from "../api/query-cache.js";

const DASHBOARD_TTL = 30000;

// The cache key is scoped to the signed-in account, so one user can never see
// another user's dashboard while the tab stays open.
const cacheKey = (userId) => `/dashboard/${userId ?? "anonymous"}`;

export const dashboardService = {
  get: (userId) => cachedQuery(cacheKey(userId), () => requestJSON("/dashboard"), DASHBOARD_TTL),
  invalidate: () => invalidateCached("/dashboard")
};
