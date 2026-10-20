import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import appDefinition from "../components/privatus_analytics/privatus_analytics.app.mjs";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "components", "privatus_analytics");

/** An app object whose requests go to `handler(request)` instead of the network. */
export function fakeApp(handler) {
  const calls = [];
  const app = {
    ...appDefinition.methods,
    $auth: {
      api_token: "pat_TEST",
    },
    calls,
    async _makeRequest({ path: requestPath, ...opts }) {
      calls.push({
        path: requestPath,
        ...opts,
      });
      return handler({
        path: requestPath,
        ...opts,
      });
    },
  };
  return app;
}

export const WORKSPACES = {
  data: [
    {
      id: "ws_TEST",
      name: "Test",
    },
  ],
};

/** Answers GET /workspaces.json and hands the rest to `handler`. */
export const withWorkspace = (handler) => (request) => {
  if (request.path === "/workspaces.json") return WORKSPACES;
  return handler(request);
};

export const step = () => {
  const exported = {};
  return {
    exported,
    export: (key, value) => {
      exported[key] = value;
    },
  };
};

export async function load(relative) {
  return (await import(path.join(ROOT, relative))).default;
}

export function components(kind) {
  return fs.readdirSync(path.join(ROOT, kind))
    .filter((name) => name !== "common")
    .map((name) => path.join(kind, name, `${name}.mjs`));
}

export const sign = (secret, body, time = Math.floor(Date.now() / 1000)) =>
  `t=${time},v1=${crypto.createHmac("sha256", secret).update(`${time}.${body}`)
    .digest("hex")}`;
