export async function onRequest({ request, env, params }) {
  const apiOrigin = env.VITE_API_BASE_URL;
  if (!apiOrigin) {
    return Response.json(
      { code: "api_not_configured", message: "The API is not configured for this environment." },
      { status: 503 }
    );
  }

  const incomingURL = new URL(request.url);
  const pathSegments = (Array.isArray(params.path) ? params.path : [params.path])
    .filter((segment) => typeof segment === "string" && segment.length > 0);
  if (!pathSegments.length) {
    return Response.json(
      { code: "not_found", message: "API route not found." },
      { status: 404 }
    );
  }

  let targetURL;
  try {
    targetURL = new URL(apiOrigin);
  } catch {
    return Response.json(
      { code: "api_not_configured", message: "The API configuration is invalid." },
      { status: 503 }
    );
  }
  if (targetURL.protocol !== "https:") {
    return Response.json(
      { code: "api_not_configured", message: "The API must use HTTPS." },
      { status: 503 }
    );
  }

  const isVersionedHealthProbe = pathSegments.length === 2
    && pathSegments[0] === "v1"
    && pathSegments[1] === "health";
  targetURL.pathname = isVersionedHealthProbe
    ? "/health"
    : `/api/${pathSegments.map(encodeURIComponent).join("/")}`;
  targetURL.search = incomingURL.search;

  return fetch(new Request(targetURL, request));
}
