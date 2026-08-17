import { handleApiRequest } from "../server/handler.mjs";

export default function handler(request, response) {
  const rawPath = Array.isArray(request.query?.path) ? request.query.path.join("/") : String(request.query?.path || "");
  const path = rawPath.replace(/^\/+|\/+$/g, "");
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  url.searchParams.delete("path");
  request.url = `/api/${path}${url.searchParams.size ? `?${url.searchParams}` : ""}`;
  return handleApiRequest(request, response);
}
