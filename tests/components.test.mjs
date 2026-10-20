import assert from "node:assert";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  ROOT, components, load, fakeApp, withWorkspace, step, sign,
} from "./helpers.mjs";
import app from "../components/privatus_analytics/privatus_analytics.app.mjs";
import events from "../tools/events.json" with { type: "json" };

const actionFiles = components("actions");
const sourceFiles = components("sources");

/** Every string a user can read in a component. */
function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => strings(entry, out));
  else if (value && typeof value === "object") {
    for (const [
      key,
      entry,
    ] of Object.entries(value)) {
      if (typeof entry === "function" || key === "methods" || key === "hooks") continue;
      if ([
        "key",
        "name",
        "label",
        "description",
        "summary",
        "options",
        "props",
        "propDefinitions",
        "propDefinition",
      ].includes(key) || typeof entry === "object") {
        strings(entry, out);
      }
    }
  }
  return out;
}

describe("package", () => {
  it("follows the layout of the registry", () => {
    for (const file of [
      "privatus_analytics.app.mjs",
      "package.json",
      "README.md",
    ]) {
      assert.ok(fs.existsSync(path.join(ROOT, file)), file);
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json")));
    assert.strictEqual(pkg.name, "@pipedream/privatus_analytics");
    assert.strictEqual(pkg.version, "0.0.1");
    assert.strictEqual(pkg.main, "privatus_analytics.app.mjs");
    assert.strictEqual(app.app, "privatus_analytics");
  });
});

describe("actions", () => {
  it("has the 21 actions and 14 searches of the Zapier app, six lookups and a custom request", () => {
    assert.strictEqual(actionFiles.length, 47);
  });

  it("has complete definitions", async () => {
    const keys = new Set();
    for (const file of actionFiles) {
      const action = await load(file);
      const slug = path.basename(file, ".mjs");
      assert.strictEqual(action.key, `privatus_analytics-${slug}`, file);
      assert.ok(!keys.has(action.key));
      keys.add(action.key);
      assert.strictEqual(action.type, "action");
      assert.strictEqual(action.version, "0.0.1");
      assert.match(action.description, /\[See the documentation\]\(https:\/\/privatusanalytics\.com\/docs\/api\)/);
      assert.deepStrictEqual(Object.keys(action.annotations).sort(), [
        "destructiveHint",
        "openWorldHint",
        "readOnlyHint",
      ]);
      assert.strictEqual(action.ai, "optimized", file);
      assert.strictEqual(action.annotations.openWorldHint, true, file);
      // Only the custom request can overwrite data (PATCH and PUT), nothing deletes it.
      assert.strictEqual(
        action.annotations.destructiveHint,
        slug === "send-custom-api-request",
        file,
      );
      assert.ok(action.props.app, file);
      assert.doesNotMatch(action.name, /Privatus|delete|remove/i);
    }
  });

  it("follows the copy rules in every label and description", async () => {
    const all = [];
    for (const file of [
      ...actionFiles,
      ...sourceFiles,
    ]) strings(await load(file), all);
    strings(app.propDefinitions, all);
    assert.ok(all.length > 800);
    for (const text of all) {
      assert.doesNotMatch(text, /—|–/, `dash in: ${text}`);
      assert.doesNotMatch(text, /;/, `semicolon in: ${text}`);
      assert.doesNotMatch(text, /\banswer/i, `answer in: ${text}`);
      assert.doesNotMatch(text, /Privatus(?![ -]|_Analytics|analytics)/, `Privatus alone in: ${text}`);
      assert.doesNotMatch(text, /[a-z]+_(list|get|create|update)\b(?!\.)/, `API tool name in: ${text}`);
    }
  });
});

const SITE_DEPENDENT = [
  "testimonialId",
  "segmentId",
  "experimentId",
  "uptimeCheckId",
  "testimonialRequestId",
  "testimonialFormId",
  "testimonialFormIds",
  "testimonialTagIds",
  "testimonialCollectionIds",
];

describe("dependent options", () => {
  it("passes the site to every options loader that needs it", async () => {
    let checked = 0;
    for (const file of [
      ...actionFiles,
      ...sourceFiles,
    ]) {
      const component = await load(file);
      for (const [
        name,
        prop,
      ] of Object.entries(component.props)) {
        const [
          , definition,
          mapper,
        ] = prop.propDefinition || [];
        if (!SITE_DEPENDENT.includes(definition)) continue;
        assert.strictEqual(typeof mapper, "function", `${file} ${name}`);
        assert.deepStrictEqual(mapper({
          siteId: "pa_TEST",
        }), {
          siteId: "pa_TEST",
        });
        checked++;
      }
    }
    assert.ok(checked > 20);
  });

  it("names a lookup action that exists in every ID description", async () => {
    const names = new Set();
    for (const file of actionFiles) names.add((await load(file)).name);
    for (const name of SITE_DEPENDENT.concat([
      "siteId",
      "siteIds",
      "alertId",
      "statusPageId",
    ])) {
      const found = [
        ...app.propDefinitions[name].description.matchAll(/Use \*\*([^*]+)\*\*/g),
      ].map((m) => m[1]);
      assert.ok(found.length, name);
      for (const tool of found) assert.ok(names.has(tool), `${name} names ${tool}`);
    }
  });
});

const run = async (file, props, handler) => {
  const action = await load(file);
  const fake = fakeApp(withWorkspace(handler));
  const ctx = {
    app: fake,
    ...props,
  };
  const $ = step();
  const result = await action.run.call(ctx, {
    $,
  });
  return {
    result,
    calls: fake.calls.filter((c) => c.path !== "/workspaces.json"),
    $,
  };
};

describe("action requests", () => {
  it("creates a site with a clean domain in the workspace of the token", async () => {
    const { calls, $ } = await run("actions/create-site/create-site.mjs", {
      domain: "https://www.Example.com/pricing",
      timezone: "Europe/Paris",
    }, () => ({
      data: {
        id: "pa_NEW",
        domain: "example.com",
      },
    }));
    assert.strictEqual(calls[0].method, "POST");
    assert.strictEqual(calls[0].path, "/workspaces/ws_TEST/sites.json");
    assert.deepStrictEqual(calls[0].data, {
      domain: "example.com",
      timezone: "Europe/Paris",
    });
    assert.match($.exported.$summary, /example\.com/);
  });

  it("gets top values as rows, with a custom property", async () => {
    const { result, calls } = await run("actions/get-top-values/get-top-values.mjs", {
      siteId: "pa_ABC",
      dimension: "prop",
      propertyKey: "plan",
      period: "custom",
      from: "2026-10-01T00:00:00Z",
      to: "2026-10-07",
      limit: 5,
      filters: "[[\"country\",\"is\",\"US\"]]",
    }, () => ({
      data: {
        rows: [
          {
            value: "pro",
            visitors: 10,
          },
        ],
      },
    }));
    assert.deepStrictEqual(result, [
      {
        rank: 1,
        value: "pro",
        visitors: 10,
      },
    ]);
    const url = new URL(`https://x${calls[0].path}`);
    assert.strictEqual(url.pathname, "/sites/pa_ABC/breakdown/prop:plan.json");
    assert.strictEqual(url.searchParams.get("from"), "2026-10-01");
    assert.strictEqual(url.searchParams.get("to"), "2026-10-07");
    assert.strictEqual(url.searchParams.get("filters"), "[[\"country\",\"is\",\"US\"]]");
  });

  it("pages through a list until it has enough, and filters goals by name", async () => {
    const page = (n) => ({
      data: [
        {
          id: `g${n}a`,
          name: "Signed up",
        },
        {
          id: `g${n}b`,
          name: "Other",
        },
      ],
      meta: {
        total_pages: 3,
      },
    });
    const { result, calls } = await run("actions/find-goals/find-goals.mjs", {
      siteId: "pa_ABC",
      name: "signed UP",
      maxResults: 2,
    }, (request) => page(/page=1&/.test(request.path)
      ? 1
      : /page=2&/.test(request.path)
        ? 2
        : 3));
    assert.deepStrictEqual(result.map((g) => g.id), [
      "g1a",
      "g2a",
    ].slice(0, 2));
    assert.strictEqual(calls.length, 3);
  });

  it("sends rating lists the way Rails reads them", async () => {
    const { calls } = await run("actions/find-testimonials/find-testimonials.mjs", {
      siteId: "pa_ABC",
      minRating: "4",
      status: [
        "approved",
        "pending",
      ],
      maxResults: 5,
    }, () => ({
      data: [],
      meta: {
        total_pages: 1,
      },
    }));
    assert.match(calls[0].path, /rating\[\]=4&rating\[\]=5/);
    assert.match(calls[0].path, /status\[\]=approved&status\[\]=pending/);
  });

  it("runs the one call actions on the right endpoints", async () => {
    const cases = [
      [
        "end-experiment",
        {
          siteId: "pa_ABC",
          experimentId: "exp_1",
        },
        "POST",
        "/sites/pa_ABC/experiments/exp_1/end.json",
      ],
      [
        "pause-uptime-check",
        {
          siteId: "pa_ABC",
          uptimeCheckId: "upc_1",
        },
        "POST",
        "/uptime/checks/upc_1/pause.json",
      ],
      [
        "resume-uptime-check",
        {
          siteId: "pa_ABC",
          uptimeCheckId: "upc_1",
        },
        "POST",
        "/uptime/checks/upc_1/resume.json",
      ],
      [
        "approve-testimonial",
        {
          siteId: "pa_ABC",
          testimonialId: "tm_1",
        },
        "POST",
        "/sites/pa_ABC/testimonials/tm_1/approve.json",
      ],
      [
        "acknowledge-alert",
        {
          alertId: "alr_1",
        },
        "POST",
        "/alerts/alr_1/acknowledge.json",
      ],
      [
        "run-site-audit",
        {
          siteId: "pa_ABC",
        },
        "POST",
        "/sites/pa_ABC/audit.json",
      ],
      [
        "get-testimonial",
        {
          siteId: "pa_ABC",
          testimonialId: "tm_1",
        },
        "GET",
        "/sites/pa_ABC/testimonials/tm_1.json",
      ],
    ];
    for (const [
      slug,
      props,
      method,
      requestPath,
    ] of cases) {
      const { calls } = await run(`actions/${slug}/${slug}.mjs`, props, () => ({
        data: {
          name: "x",
        },
      }));
      assert.strictEqual(calls.length, 1, slug);
      assert.strictEqual(calls[0].method, method, slug);
      assert.strictEqual(calls[0].path, requestPath, slug);
    }
  });

  it("pins and unpins, mutes, and adds a cost for a month", async () => {
    const pin = await run("actions/pin-testimonial/pin-testimonial.mjs", {
      siteId: "pa_ABC",
      testimonialId: "tm_1",
      pinned: false,
    }, () => ({
      data: {},
    }));
    assert.deepStrictEqual(pin.calls[0].data, {
      pinned: false,
    });
    const mute = await run("actions/mute-alert/mute-alert.mjs", {
      alertId: "alr_1",
      minutes: 0,
    }, () => ({
      data: {
        name: "Alert",
      },
    }));
    assert.deepStrictEqual(mute.calls[0].data, {
      minutes: 0,
    });
    const cost = await run("actions/add-campaign-cost/add-campaign-cost.mjs", {
      siteId: "pa_ABC",
      campaign: "spring",
      month: "2026-09-15",
      amount: "1250.50",
    }, () => ({
      data: {},
    }));
    assert.deepStrictEqual(cost.calls[0].data, {
      campaign: "spring",
      month: "2026-09",
      amount: 1250.5,
    });
  });

  it("creates a testimonial as text, with a typed rating, tags and properties", async () => {
    const { calls } = await run("actions/create-testimonial/create-testimonial.mjs", {
      siteId: "pa_ABC",
      body: "Great",
      personName: "Ann",
      rating: "5",
      tags: [
        "launch, vip",
      ],
      properties: {
        plan: "pro",
      },
    }, () => ({
      data: {},
    }));
    assert.deepStrictEqual(calls[0].data, {
      kind: "text",
      body: "Great",
      person_name: "Ann",
      rating: 5,
      tags: [
        "launch",
        "vip",
      ],
      properties: {
        plan: "pro",
      },
    });
  });

  it("asks a person through a request", async () => {
    const { calls } = await run("actions/ask-for-testimonial/ask-for-testimonial.mjs", {
      siteId: "pa_ABC",
      requestId: "req_1",
      email: "a@example.com",
      name: "Ann",
    }, () => ({
      data: {
        added: 1,
      },
    }));
    assert.strictEqual(calls[0].path, "/sites/pa_ABC/testimonials/requests/req_1/recipients.json");
    assert.deepStrictEqual(calls[0].data, {
      recipients: [
        {
          email: "a@example.com",
          name: "Ann",
        },
      ],
    });
  });

  it("takes the latest finished audit, or none", async () => {
    const found = await run("actions/get-latest-site-audit/get-latest-site-audit.mjs", {
      siteId: "pa_ABC",
    }, () => ({
      data: [
        {
          id: "aud_1",
        },
        {
          id: "aud_0",
        },
      ],
    }));
    assert.deepStrictEqual(found.result, {
      id: "aud_1",
    });
    assert.match(found.calls[0].path, /status=complete&per_page=1/);
  });

  it("sends a custom request only to the API host and never a DELETE", async () => {
    const { calls } = await run("actions/send-custom-api-request/send-custom-api-request.mjs", {
      method: "POST",
      path: "https://evil.example.net/sites/pa_1/goals",
      query: {
        a: [
          "1",
          "2",
        ],
      },
      body: {
        name: "X",
      },
    }, () => ({
      data: {},
    }));
    assert.strictEqual(calls[0].path, "/sites/pa_1/goals.json?a[]=1&a[]=2");
    assert.deepStrictEqual(calls[0].data, {
      name: "X",
    });
    const action = await load("actions/send-custom-api-request/send-custom-api-request.mjs");
    assert.deepStrictEqual(action.props.method.options, [
      "GET",
      "PATCH",
      "POST",
      "PUT",
    ]);
  });

  it("rejects a custom request path outside the API host", async () => {
    await assert.rejects(run("actions/send-custom-api-request/send-custom-api-request.mjs", {
      method: "GET",
      path: "//evil.example.net/x",
    }, () => ({})), /Path/);
  });

  it("sends a null to clear the rating and the highlight of a testimonial", async () => {
    const { calls } = await run("actions/update-testimonial/update-testimonial.mjs", {
      siteId: "pa_1",
      testimonialId: "tm_1",
      title: "New title",
      clearRating: true,
      clearHighlight: true,
    }, () => ({
      data: {},
    }));
    assert.strictEqual(calls[0].method, "PATCH");
    assert.deepStrictEqual(calls[0].data, {
      title: "New title",
      rating: null,
      highlight: null,
    });
    const kept = await run("actions/update-testimonial/update-testimonial.mjs", {
      siteId: "pa_1",
      testimonialId: "tm_1",
      rating: "4",
    }, () => ({
      data: {},
    }));
    assert.deepStrictEqual(kept.calls[0].data, {
      rating: 4,
    });
  });

  it("does not make up a date for a chart note, and uses the workspace path helper", async () => {
    const site = await run("actions/create-chart-note/create-chart-note.mjs", {
      siteId: "pa_1",
      title: "Deploy",
    }, () => ({
      data: {
        title: "Deploy",
      },
    }));
    assert.deepStrictEqual(site.calls[0].data, {
      title: "Deploy",
    });
    const workspace = await run("actions/create-workspace-chart-note/create-workspace-chart-note.mjs", {
      title: "Release",
      date: "2026-10-20T23:30:00Z",
    }, () => ({
      data: {
        title: "Release",
      },
    }));
    assert.strictEqual(workspace.calls[0].path, "/workspaces/ws_TEST/notes.json");
    assert.deepStrictEqual(workspace.calls[0].data, {
      title: "Release",
      date: "2026-10-20",
    });
  });

  it("asks for the property key when the report is a custom property", async () => {
    await assert.rejects(run("actions/get-top-values/get-top-values.mjs", {
      siteId: "pa_ABC",
      dimension: "prop",
      period: "7d",
    }, () => ({})), /Property Key/);
  });

  it("limits the live visitors feed from 1 to 100", async () => {
    const action = await load("actions/get-live-visitors/get-live-visitors.mjs");
    assert.strictEqual(action.props.limit.default, 10);
    assert.strictEqual(action.props.limit.min, 1);
    assert.strictEqual(action.props.limit.max, 100);
  });

  it("finds status pages and testimonial requests", async () => {
    const pages = await run("actions/find-status-pages/find-status-pages.mjs", {
      maxResults: 10,
    }, () => ({
      data: [
        {
          id: "sp_1",
        },
      ],
      meta: {
        total_pages: 1,
      },
    }));
    assert.match(pages.calls[0].path, /^\/workspaces\/ws_TEST\/status_pages\.json\?/);
    assert.deepStrictEqual(pages.result, [
      {
        id: "sp_1",
      },
    ]);
    const requests = await run("actions/find-testimonial-requests/find-testimonial-requests.mjs", {
      siteId: "pa_1",
      status: "draft",
      maxResults: 10,
    }, () => ({
      data: [],
      meta: {
        total_pages: 1,
      },
    }));
    assert.match(requests.calls[0].path, /^\/sites\/pa_1\/testimonials\/requests\.json\?status=draft&/);
  });
});

describe("app", () => {
  it("sends the token as a bearer header to the API host", () => {
    const fake = fakeApp(() => ({}));
    assert.strictEqual(fake._baseUrl(), "https://privatusanalytics.com");
    assert.strictEqual(fake._headers().Authorization, "Bearer pat_TEST");
  });

  it("lists options with pages that start at 0", async () => {
    const fake = fakeApp(withWorkspace(() => ({
      data: [
        {
          id: "pa_1",
          name: "Shop",
          domain: "shop.com",
        },
        {
          id: "pa_2",
          name: "a.com",
          domain: "a.com",
        },
      ],
    })));
    const options = await app.propDefinitions.siteId.options.call(fake, {
      page: 1,
    });
    assert.deepStrictEqual(options, [
      {
        label: "Shop (shop.com)",
        value: "pa_1",
      },
      {
        label: "a.com",
        value: "pa_2",
      },
    ]);
    assert.match(fake.calls[1].path, /^\/workspaces\/ws_TEST\/sites\.json\?page=2&per_page=100$/);
    const none = await app.propDefinitions.experimentId.options.call(fake, {
      page: 0,
    });
    assert.deepStrictEqual(none, []);
  });
});

describe("sources", () => {
  it("has one source for each of the 25 events", async () => {
    assert.strictEqual(sourceFiles.length, 25);
    const seen = new Set();
    for (const file of sourceFiles) {
      const source = await load(file);
      const slug = path.basename(file, ".mjs");
      assert.strictEqual(source.key, `privatus_analytics-${slug}`);
      assert.strictEqual(source.type, "source");
      assert.strictEqual(source.version, "0.0.1");
      assert.strictEqual(source.dedupe, "unique");
      assert.match(source.name, /^New .* \(Instant\)$/);
      assert.match(source.description, /^Emit new event when /);
      assert.ok(source.sampleEmit.id && source.sampleEmit.event === source.methods.getEvent(), file);
      assert.strictEqual(source.props.http.customResponse, true);
      seen.add(source.methods.getEvent());
    }
    assert.deepStrictEqual([...seen].sort(), events.map((e) => e.value).sort());
  });
});

/** A source with fake props, a fake database and a fake app. */
async function sourceContext(file, props = {}, handler = () => ({})) {
  const source = await load(file);
  const store = {};
  const emitted = [];
  const responses = [];
  const fake = fakeApp(withWorkspace(handler));
  const ctx = {
    ...source.methods,
    app: fake,
    http: {
      endpoint: "https://events.m.pipedream.net",
      respond: (response) => responses.push(response),
    },
    db: {
      get: (key) => store[key],
      set: (key, value) => {
        store[key] = value;
      },
    },
    $emit: (event, meta) => emitted.push({
      event,
      meta,
    }),
    ...props,
  };
  return {
    source,
    ctx,
    store,
    emitted,
    responses,
    fake,
  };
}

const SECRET = "whsec_abc";
const received = {
  id: "whd_1",
  event: "testimonial.received",
  created_at: "2026-10-20T10:15:00Z",
  workspace_id: "ws_1",
  data: {
    site_id: "pa_1",
    testimonial: {
      id: "tm_1",
      rating: 5,
      person: {
        name: "Ann",
      },
    },
    source: "form",
  },
};
const FILE = "sources/new-testimonial-instant/new-testimonial-instant.mjs";

const deliver = async (setup, envelope, headers) => {
  const raw = JSON.stringify(envelope);
  const header = headers === undefined
    ? {
      "privatus-signature": sign(SECRET, raw),
    }
    : headers;
  await setup.source.run.call(setup.ctx, {
    headers: header,
    bodyRaw: raw,
    body: envelope,
  });
};

describe("source lifecycle and deliveries", () => {
  it("creates a webhook for its event on activate and keeps the id and secret", async () => {
    const setup = await sourceContext(FILE, {}, () => ({
      data: {
        id: "wh_1",
        secret: "whsec_new",
      },
    }));
    await setup.source.hooks.activate.call(setup.ctx);
    const post = setup.fake.calls.find((c) => c.method === "POST");
    assert.strictEqual(post.path, "/workspaces/ws_TEST/webhooks.json");
    assert.deepStrictEqual(post.data, {
      url: "https://events.m.pipedream.net",
      events: [
        "testimonial.received",
      ],
      enabled: true,
    });
    assert.deepStrictEqual(setup.store, {
      hookId: "wh_1",
      secret: "whsec_new",
      workspaceId: "ws_TEST",
    });
  });

  it("deletes the webhook on deactivate", async () => {
    const setup = await sourceContext(FILE);
    setup.store.hookId = "wh_1";
    setup.store.workspaceId = "ws_TEST";
    await setup.source.hooks.deactivate.call(setup.ctx);
    const del = setup.fake.calls.find((c) => c.method === "DELETE");
    assert.strictEqual(del.path, "/workspaces/ws_TEST/webhooks/wh_1.json");
    assert.strictEqual(setup.store.hookId, null);
  });

  it("emits the flattened payload of a signed delivery, with an id for deduping", async () => {
    const setup = await sourceContext(FILE);
    setup.store.secret = SECRET;
    await deliver(setup, received);
    assert.deepStrictEqual(setup.responses, [
      {
        status: 200,
        body: "OK",
      },
    ]);
    assert.strictEqual(setup.emitted.length, 1);
    assert.deepStrictEqual(setup.emitted[0].event, {
      id: "whd_1",
      event: "testimonial.received",
      occurred_at: "2026-10-20T10:15:00Z",
      workspace_id: "ws_1",
      site_id: "pa_1",
      testimonial: {
        id: "tm_1",
        rating: 5,
        person: {
          name: "Ann",
        },
      },
      source: "form",
    });
    assert.deepStrictEqual(setup.emitted[0].meta, {
      id: "whd_1",
      summary: "New testimonial from Ann",
      ts: Date.parse("2026-10-20T10:15:00Z"),
    });
  });

  it("answers 401 and emits nothing without a valid signature", async () => {
    const raw = JSON.stringify(received);
    const cases = {
      missing: {},
      garbage: {
        "privatus-signature": "t=1,v1=zz",
      },
      expired: {
        "privatus-signature": sign(SECRET, raw, Math.floor(Date.now() / 1000) - 3600),
      },
      "other secret": {
        "privatus-signature": sign("whsec_other", raw),
      },
    };
    for (const [
      name,
      headers,
    ] of Object.entries(cases)) {
      const setup = await sourceContext(FILE);
      setup.store.secret = SECRET;
      await deliver(setup, received, headers);
      assert.strictEqual(setup.responses[0].status, 401, name);
      assert.strictEqual(setup.emitted.length, 0, name);
    }
    const unknown = await sourceContext(FILE);
    await deliver(unknown, received);
    assert.strictEqual(unknown.responses[0].status, 401, "no secret known");
  });

  it("finds the signature header whatever its case, and refuses a changed body", async () => {
    const setup = await sourceContext(FILE);
    setup.store.secret = SECRET;
    await deliver(setup, received, {
      "Privatus-Signature": sign(SECRET, JSON.stringify(received)),
    });
    assert.strictEqual(setup.emitted.length, 1);

    const tampered = await sourceContext(FILE);
    tampered.store.secret = SECRET;
    const raw = JSON.stringify(received);
    await tampered.source.run.call(tampered.ctx, {
      headers: {
        "privatus-signature": sign(SECRET, raw),
      },
      bodyRaw: raw.replace("\"rating\":5", "\"rating\":1"),
      body: received,
    });
    assert.strictEqual(tampered.responses[0].status, 401);
  });

  it("applies its filters and ignores other events", async () => {
    const site = await sourceContext(FILE, {
      siteId: "pa_2",
    });
    site.store.secret = SECRET;
    await deliver(site, received);
    assert.strictEqual(site.emitted.length, 0);

    const rating = await sourceContext(FILE, {
      minRating: "5",
    });
    rating.store.secret = SECRET;
    await deliver(rating, received);
    assert.strictEqual(rating.emitted.length, 1);

    const low = await sourceContext(FILE, {
      minRating: "5",
    });
    low.store.secret = SECRET;
    await deliver(low, {
      ...received,
      data: {
        ...received.data,
        testimonial: {
          id: "tm_1",
          rating: 3,
        },
      },
    });
    assert.strictEqual(low.emitted.length, 0);

    const other = await sourceContext(FILE);
    other.store.secret = SECRET;
    await deliver(other, {
      ...received,
      event: "site.created",
    });
    assert.strictEqual(other.emitted.length, 0);
  });

  it("finds the site of an uptime delivery on the check and keeps an export id", async () => {
    const uptime = await sourceContext("sources/new-uptime-check-down-instant/new-uptime-check-down-instant.mjs", {
      siteId: "pa_9",
    });
    uptime.store.secret = SECRET;
    await deliver(uptime, {
      id: "whd_2",
      event: "uptime.down",
      created_at: "2026-10-20T10:15:00Z",
      data: {
        check: {
          id: "upc_1",
          site_id: "pa_9",
          name: "Home",
        },
      },
    });
    assert.strictEqual(uptime.emitted.length, 1);
    assert.strictEqual(uptime.emitted[0].meta.summary, "Home is down");

    const exported = await sourceContext("sources/new-export-ready-instant/new-export-ready-instant.mjs");
    exported.store.secret = SECRET;
    await deliver(exported, {
      id: "whd_3",
      event: "export.ready",
      created_at: "2026-10-20T10:15:00Z",
      data: {
        id: "exp_1",
        site_id: "pa_1",
      },
    });
    assert.strictEqual(exported.emitted[0].event.id, "whd_3");
    assert.strictEqual(exported.emitted[0].event.export_id, "exp_1");
  });
});
