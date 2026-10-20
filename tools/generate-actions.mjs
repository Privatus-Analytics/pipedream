#!/usr/bin/env node
// Writes components/privatus_analytics/actions/*/*.mjs from the definitions
// below and tools/spec.json (the part of https://privatusanalytics.com/openapi.json
// the components use, the same file as in the n8n package). Development tool,
// not part of the pull request. Run it, then format with the repository's ESLint:
//
//   node tools/generate-actions.mjs
//   npx eslint --fix components/privatus_analytics

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(fs.readFileSync(path.join(here, "spec.json"), "utf8"));
const outDir = path.join(here, "..", "components", "privatus_analytics", "actions");

const DOCS = "https://privatusanalytics.com/docs/api";

// ---------- text helpers ----------

const WORDS = {
  id: "ID", ids: "IDs", url: "URL", utm: "UTM", dns: "DNS", tcp: "TCP", http: "HTTP",
  ssl: "SSL", api: "API", csv: "CSV", json: "JSON", xlsx: "XLSX", ndjson: "NDJSON", zip: "ZIP",
};
const label = (name) => name.replace(/_id$/, "").replace(/_ids$/, "s")
  .split("_")
  .map((w) => WORDS[w] || w.charAt(0).toUpperCase() + w.slice(1))
  .join(" ");
const camel = (name) => name.replace(/_([a-z0-9])/g, (_m, c) => c.toUpperCase());

const describe = (text) => {
  if (!text) return undefined;
  let clean = text.replace(/\s+/g, " ")
    .replace(/\s*\((?:[^()]*?)from [a-z_]+_(?:list|get)\)/gi, "")
    .replace(/,? from [a-z_]+_(?:list|get)\b/gi, "")
    .replace(/, the id field returned by [a-z_]+/gi, "")
    .trim();
  if (clean.length > 500) {
    const cut = clean.slice(0, 500);
    const stop = cut.lastIndexOf(". ");
    clean = stop > 150 ? cut.slice(0, stop + 1) : `${cut.replace(/\s+\S*$/, "")}...`;
  }
  clean = clean.replace(/\.$/, "");
  // Pipedream descriptions are Markdown: a dollar sign or an underscore name is code.
  return `${clean}.`;
};

// ---------- field definitions ----------

const SITE = { p: "siteId", api: "site_id", pd: "siteId", required: true };
const ROOT_DEPEND = (api, pd, o = {}) => ({ p: camel(api), api, pd, ...o });

/**
 * One field of an action, from the API document.
 *   o.pd        a propDefinition of the app file
 *   o.type      day | month | iso | json | number | list | object | integer | boolean | string
 *   o.expr      the JavaScript that gives the value sent to the API
 *   o.virtual   not sent to the API (the action's own code reads it)
 */
const field = (opId, api, o = {}) => {
  const input = spec[opId].inputs.find((i) => i.name === api) || { name: api, type: "string" };
  let type = o.type;
  let options = o.options;
  if (!type) {
    if (input.enum) {
      type = "string";
      options = options || input.enum;
    } else if (input.type === "array") {
      type = input.items === "object" || input.items === "array" || api === "filters"
        ? "json"
        : "list";
      if (input.itemsEnum) options = options || input.itemsEnum;
    } else if (input.type === "object") type = "object";
    else if (input.type === "integer") type = "integer";
    else if (input.type === "number") type = "number";
    else if (input.type === "boolean") type = "boolean";
    else type = "string";
  }
  return {
    p: o.p || camel(api),
    api,
    in: input.in || "body",
    type,
    options,
    label: o.label || label(api),
    description: o.description || describe(input.description),
    required: o.required ?? Boolean(input.required),
    default: o.default !== undefined ? o.default : (typeof input.default !== "object" ? input.default : undefined),
    ...o,
  };
};

// ---------- action definitions ----------

const f = field;
const ACTIONS = [];
const action = (def) => ACTIONS.push(def);

// -- Sites and analytics
action({
  slug: "create-site", name: "Create Site", op: "sites_create", workspace: true,
  description: "Adds a website to the workspace and returns its tracking snippet.",
  fields: [
    f("sites_create", "domain", { required: true, expr: "utils.normalizeDomain(this.domain)", description: "The domain to track, like `example.com`. A pasted address such as `https://www.example.com/pricing` is shortened to `example.com`." }),
    f("sites_create", "name"), f("sites_create", "timezone"), f("sites_create", "currency"),
  ],
  summary: "`Successfully created site '${response.domain}'`",
});
action({
  slug: "find-site", name: "Find Site", op: "sites_list", workspace: true, read: true, list: true,
  description: "Finds a site by its main domain or an extra domain.",
  fields: [{ p: "domain", api: "domain", type: "string", virtual: true, label: "Domain", required: true, description: "Like `example.com`. A full address works too." }],
  paramsCode: "query: utils.normalizeDomain(this.domain)",
  postCode: `const domain = utils.normalizeDomain(this.domain);
    items = items.filter((site) => utils.normalizeDomain(site.domain) === domain
      || (site.extra_domains || []).map(utils.normalizeDomain).includes(domain));`,
  summary: "`Found ${items.length} matching site${items.length === 1 ? \"\" : \"s\"}`",
});
action({
  slug: "get-site-stats", name: "Get Site Stats", op: "stats_aggregate", read: true,
  description: "Gets the visitors, visits, pageviews, bounce rate, visit duration and revenue of a site for a period, optionally compared with an earlier one.",
  fields: [
    { ...SITE, ...f("stats_aggregate", "site_id", { pd: "siteId", required: true }) },
    f("stats_aggregate", "period", { pd: "period" }), f("stats_aggregate", "from", { pd: "from" }), f("stats_aggregate", "to", { pd: "to" }),
    f("stats_aggregate", "compare", { default: "none" }),
    f("stats_aggregate", "filters", { pd: "filters" }),
    f("stats_aggregate", "segment_id", { pd: "segmentId" }),
    f("stats_aggregate", "include_imported"),
  ],
  summary: "`Successfully retrieved the stats of the site for the period ${response.period.from} to ${response.period.to}`",
  fixedExpr: { from: "this.period === \"custom\" ? utils.toDate(this.from) : undefined", to: "this.period === \"custom\" ? utils.toDate(this.to) : undefined" },
});
action({
  slug: "get-top-values", name: "Get Top Values", op: "stats_breakdown", read: true,
  description: "Gets the top values of one report (pages, referrers, campaigns, countries, devices, events, goals and more) for a period, one item for each row.",
  fields: [
    f("stats_breakdown", "site_id", { pd: "siteId", required: true }),
    f("stats_breakdown", "dimension", {
      label: "Report", required: true, default: "page", in: "path",
      options: [
        ["page", "Page"], ["entry_page", "Entry Page"], ["exit_page", "Exit Page"], ["channel", "Channel"], ["referrer", "Referrer"],
        ["utm_source", "UTM Source"], ["utm_medium", "UTM Medium"], ["utm_campaign", "UTM Campaign"], ["utm_content", "UTM Content"],
        ["utm_term", "UTM Term"], ["country", "Country"], ["language", "Language"], ["device", "Device"], ["browser", "Browser"],
        ["os", "Operating System"], ["hostname", "Hostname"], ["event", "Custom Event"], ["goal", "Goal"], ["prop", "Custom Event Property"],
      ],
      description: "What to group by. For **Custom Event Property** fill in **Property Key**.",
      expr: "this.dimension === \"prop\" ? `prop:${this.propertyKey}` : this.dimension",
    }),
    { p: "propertyKey", api: "property_key", type: "string", virtual: true, label: "Property Key", description: "The key of the custom event property, like `plan`. Only used when **Report** is **Custom Event Property**." },
    f("stats_breakdown", "period", { pd: "period" }), f("stats_breakdown", "from", { pd: "from" }), f("stats_breakdown", "to", { pd: "to" }),
    f("stats_breakdown", "limit", { label: "Rows", default: 10, description: "How many rows to return, from 1 to 100." }),
    f("stats_breakdown", "sort", { options: ["visitors", "visits", "pageviews", "revenue"] }),
    f("stats_breakdown", "search"),
    f("stats_breakdown", "filters", { pd: "filters" }),
    f("stats_breakdown", "segment_id", { pd: "segmentId" }),
  ],
  fixedExpr: { from: "this.period === \"custom\" ? utils.toDate(this.from) : undefined", to: "this.period === \"custom\" ? utils.toDate(this.to) : undefined" },
  postCode: "const rows = (response.rows || []).map((row, index) => ({\n      rank: index + 1,\n      ...row,\n    }));",
  returns: "rows",
  summary: "`Successfully retrieved ${rows.length} row${rows.length === 1 ? \"\" : \"s\"}`",
});
action({
  slug: "get-time-series", name: "Get Time Series", op: "stats_timeseries", read: true,
  description: "Gets the visitors, visits and pageviews of a site for each hour, day, week or month of a period, one item for each point.",
  fields: [
    f("stats_timeseries", "site_id", { pd: "siteId", required: true }),
    f("stats_timeseries", "period", { pd: "period" }), f("stats_timeseries", "from", { pd: "from" }), f("stats_timeseries", "to", { pd: "to" }),
    f("stats_timeseries", "interval", { default: "day" }),
    f("stats_timeseries", "filters", { pd: "filters" }),
    f("stats_timeseries", "segment_id", { pd: "segmentId" }),
  ],
  fixedExpr: { from: "this.period === \"custom\" ? utils.toDate(this.from) : undefined", to: "this.period === \"custom\" ? utils.toDate(this.to) : undefined" },
  postCode: "const series = response.series || [];",
  returns: "series",
  summary: "`Successfully retrieved ${series.length} point${series.length === 1 ? \"\" : \"s\"}`",
});
action({
  slug: "get-live-visitors", name: "Get Live Visitors", op: "live_get", read: true,
  description: "Gets how many visitors are on a site right now (the last 30 minutes) and its latest activity.",
  fields: [f("live_get", "site_id", { pd: "siteId", required: true }), f("live_get", "feed"), f("live_get", "limit", { default: 10 }), f("live_get", "filters", { pd: "filters" })],
  summary: "`${response.live_visitors} visitor${response.live_visitors === 1 ? \"\" : \"s\"} on the site right now`",
});

// -- Goals and notes
action({
  slug: "create-goal", name: "Create Goal", op: "goals_create",
  description: "Creates a conversion goal on a site. Goals count matching events across all existing history at once.",
  fields: [
    f("goals_create", "site_id", { pd: "siteId", required: true }),
    f("goals_create", "name", { required: true }), f("goals_create", "kind", { required: true, default: "page" }),
    f("goals_create", "match_type"), f("goals_create", "pattern"), f("goals_create", "hostname"), f("goals_create", "event_name"),
    f("goals_create", "conditions", { type: "json", description: "Event goals only. A JSON list of property tests that must all match, like `[{\"key\":\"plan\",\"operator\":\"is\",\"value\":\"pro\"}]`. Operators: `is`, `is_not`, `contains`, `gt`, `lt`." }),
    f("goals_create", "scroll_threshold"), f("goals_create", "time_threshold_seconds"),
    f("goals_create", "value_mode"),
    f("goals_create", "fixed_value", { type: "number", description: "The value of one completion in the site currency, like `49.5`. Used when **Value Mode** is `fixed`." }),
    f("goals_create", "count_mode"),
  ],
  summary: "`Successfully created goal '${response.name}'`",
});
action({
  slug: "find-goals", name: "Find Goals", op: "goals_list", read: true, list: true,
  description: "Lists the goals of a site, or finds one by name, with its completions for a period.",
  fields: [
    f("goals_list", "site_id", { pd: "siteId", required: true }),
    { p: "name", api: "name", type: "string", virtual: true, label: "Name", description: "Only goals with this name, not case sensitive." },
    f("goals_list", "period", { pd: "period" }), f("goals_list", "from", { pd: "from" }), f("goals_list", "to", { pd: "to" }),
    f("goals_list", "status", { default: "active" }),
  ],
  fixedExpr: { from: "this.period === \"custom\" ? utils.toDate(this.from) : undefined", to: "this.period === \"custom\" ? utils.toDate(this.to) : undefined" },
  postCode: "const wanted = (this.name || \"\").trim().toLowerCase();\n    if (wanted) items = items.filter((goal) => String(goal.name).toLowerCase() === wanted);",
  summary: "`Found ${items.length} goal${items.length === 1 ? \"\" : \"s\"}`",
});
for (const [slug, name, op, scope] of [
  ["create-chart-note", "Create Chart Note", "notes_create", "site"],
  ["create-workspace-chart-note", "Create Workspace Chart Note", "workspace_notes_create", "workspace"],
]) {
  action({
    slug, name, op, workspace: scope === "workspace",
    description: scope === "site"
      ? "Adds a note (annotation) to the charts of a site, such as a deploy, a campaign launch or an outage."
      : "Adds a note to the charts of every site in the workspace, such as a release that touched them all.",
    fields: [
      ...(scope === "site" ? [f(op, "site_id", { pd: "siteId", required: true })] : []),
      f(op, "title", { required: true, description: "Short title shown on the chart." }),
      f(op, "date", { expr: "utils.toDate(this.date) ?? new Date().toISOString().slice(0, 10)", description: "The day the note is shown on, as `YYYY-MM-DD`. Defaults to today." }),
      f(op, "end_date", { expr: "utils.toDate(this.endDate)", description: "For a note that covers several days, the last day, as `YYYY-MM-DD`." }),
      f(op, "body"), f(op, "url", { label: "Link" }), f(op, "color"), f(op, "source"), f(op, "version"),
    ],
    summary: "`Successfully created chart note '${response.title}'`",
  });
}

// -- Campaigns
action({
  slug: "create-campaign-link", name: "Create Campaign Link", op: "links_create",
  description: "Saves a tagged campaign link (with UTM parameters) in the campaign URL builder and returns the full URL.",
  fields: [
    f("links_create", "site_id", { pd: "siteId", required: true }), f("links_create", "name", { required: true }),
    f("links_create", "destination", { required: true, label: "Destination URL" }),
    f("links_create", "utm_source"), f("links_create", "utm_medium"), f("links_create", "utm_campaign"), f("links_create", "utm_content"), f("links_create", "utm_term"),
    f("links_create", "tags"), f("links_create", "notes"),
  ],
  summary: "`Successfully created campaign link '${response.name}'`",
});
action({
  slug: "add-campaign-cost", name: "Add Campaign Cost", op: "campaign_costs_create",
  description: "Records what a campaign cost in a month, for cost per acquisition and return on ad spend (Business plan).",
  fields: [
    f("campaign_costs_create", "site_id", { pd: "siteId", required: true }),
    f("campaign_costs_create", "campaign", { required: true, description: "The `utm_campaign` value the cost belongs to, exactly as it arrives on the site." }),
    f("campaign_costs_create", "month", { required: true, expr: "utils.toMonth(this.month)", description: "The month the money was spent, as `YYYY-MM`. Any day in it works, like `2026-10-01`." }),
    f("campaign_costs_create", "amount", { required: true, type: "number", description: "The spend for the month in major currency units, like `1250.50`." }),
    f("campaign_costs_create", "currency"),
  ],
  summary: "`Successfully added the cost of campaign '${this.campaign}'`",
});

// -- Uptime and alerts
action({
  slug: "create-uptime-check", name: "Create Uptime Check", op: "uptime_checks_create",
  description: "Starts monitoring a URL, a keyword on a page, a TCP port or a DNS name for a site.",
  fields: [
    f("uptime_checks_create", "site_id", { pd: "siteId", required: true }),
    ...["name", "kind", "url", "host", "port", "keyword", "expected_status", "http_method", "interval_seconds", "timeout_seconds", "public"].map((n) => f("uptime_checks_create", n)),
  ],
  summary: "`Successfully created uptime check '${response.name}'`",
});
action({
  slug: "find-uptime-checks", name: "Find Uptime Checks", op: "uptime_checks_list", read: true, list: true,
  description: "Lists the uptime checks of a site, or finds one by name or URL, with its status and uptime.",
  fields: [f("uptime_checks_list", "site_id", { pd: "siteId", required: true }), f("uptime_checks_list", "query", { label: "Name or URL" }), f("uptime_checks_list", "status")],
  summary: "`Found ${items.length} uptime check${items.length === 1 ? \"\" : \"s\"}`",
});
for (const [slug, name, op, text, done] of [
  ["pause-uptime-check", "Pause Uptime Check", "uptime_checks_pause", "Pauses an uptime check, for example during planned maintenance.", "paused"],
  ["resume-uptime-check", "Resume Uptime Check", "uptime_checks_resume", "Resumes a paused uptime check.", "resumed"],
]) {
  action({
    slug, name, op, description: text,
    fields: [
      { p: "siteId", api: "site_id", pd: "siteId", required: true, virtual: true },
      { p: "uptimeCheckId", api: "id", in: "path", pd: "uptimeCheckId", required: true },
    ],
    summary: `\`Successfully ${done} uptime check '\${response.name}'\``,
  });
}
action({
  slug: "find-alert-rules", name: "Find Alert Rules", op: "alerts_list", workspace: true, read: true, list: true,
  description: "Lists the alert rules of the workspace, or finds one by name, with its state (ok or triggered).",
  fields: [
    { p: "name", api: "name", type: "string", virtual: true, label: "Name", description: "Part of the rule name, not case sensitive." },
    { ...f("alerts_list", "site_id", { pd: "siteId" }), required: false },
    f("alerts_list", "state"), f("alerts_list", "kind"),
  ],
  postCode: "const wanted = (this.name || \"\").trim().toLowerCase();\n    if (wanted) items = items.filter((alert) => String(alert.name).toLowerCase().includes(wanted));",
  summary: "`Found ${items.length} alert rule${items.length === 1 ? \"\" : \"s\"}`",
});
action({
  slug: "acknowledge-alert", name: "Acknowledge Alert", op: "alerts_acknowledge",
  description: "Acknowledges the open incident of an alert rule, so the team knows someone is on it.",
  fields: [{ p: "alertId", api: "id", in: "path", pd: "alertId", required: true }],
  summary: "`Successfully acknowledged alert '${response.name}'`",
});
action({
  slug: "mute-alert", name: "Mute Alert", op: "alerts_mute",
  description: "Silences the notifications of an alert rule for a number of minutes. It keeps recording incidents.",
  fields: [{ p: "alertId", api: "id", in: "path", pd: "alertId", required: true }, f("alerts_mute", "minutes", { default: 60 })],
  summary: "`Successfully muted alert '${response.name}' for ${this.minutes ?? 60} minutes`",
});
action({
  slug: "post-status-page-update", name: "Post Status Page Update", op: "status_page_posts_create", openWorld: true,
  description: "Publishes an incident update on a status page and, by default, emails the subscribers of the page.",
  fields: [
    { p: "statusPageId", api: "status_page_id", in: "path", pd: "statusPageId", required: true },
    f("status_page_posts_create", "title", { required: true }), f("status_page_posts_create", "body"),
    f("status_page_posts_create", "status", { default: "investigating" }),
    f("status_page_posts_create", "posted_at", { description: "When it happened, as an ISO 8601 time like `2026-10-02T14:30:00Z`. Defaults to now. Posts are sorted by this time." }),
    f("status_page_posts_create", "notify", { label: "Email Subscribers", default: true }),
  ],
  summary: "`Successfully posted '${response.title}' on the status page`",
});

// -- Exports, members, audits
action({
  slug: "create-export", name: "Create Export", op: "exports_create", workspace: true,
  description: "Queues a data export (CSV, JSON, XLSX, NDJSON or a ZIP of dashboard panels). Use the Export Ready source to act when its file is ready.",
  fields: [
    f("exports_create", "site_id", { pd: "siteId", required: true }),
    f("exports_create", "from", { required: true, expr: "utils.toDate(this.from)", description: "The first day to include, as `YYYY-MM-DD`." }),
    f("exports_create", "to", { required: true, expr: "utils.toDate(this.to)", description: "The last day to include, included, as `YYYY-MM-DD`. At most 400 days after the first (93 days for raw)." }),
    f("exports_create", "kind"), f("exports_create", "file_format", { label: "File Format" }), f("exports_create", "timezone"), f("exports_create", "grouping"),
    f("exports_create", "dimensions"), f("exports_create", "metrics"), f("exports_create", "fields"),
    f("exports_create", "filters", { pd: "filters" }), f("exports_create", "segment_id", { pd: "segmentId" }),
  ],
  summary: "`Successfully queued export ${response.id}`",
});
action({
  slug: "invite-members", name: "Invite Members", op: "invitations_create", workspace: true, openWorld: true,
  description: "Invites people to the workspace by email. Each gets an invitation link valid for 14 days.",
  fields: [
    f("invitations_create", "emails", { required: true, label: "Emails", description: "Up to 50 email addresses. Addresses that are already members are skipped." }),
    f("invitations_create", "role", { options: ["admin", "editor", "analyst", "viewer", "billing"], default: "viewer" }),
    f("invitations_create", "all_sites", { default: true, description: "Whether they may open every site, including future ones. Turn it off to limit them to **Sites**." }),
    { p: "siteIds", api: "site_ids", type: "list", label: "Sites", optional: true, description: "The sites they may open, as site IDs like `pa_7Q2K9XH3AB`. Only used when **All Sites** is off." },
  ],
  summary: "`Successfully invited ${(response || []).length || this.emails.length} people`",
});
action({
  slug: "find-members", name: "Find Members", op: "members_list", workspace: true, read: true, list: true,
  description: "Lists the members of the workspace, or finds one by name or email, with their role.",
  fields: [f("members_list", "query", { label: "Name or Email" }), f("members_list", "role")],
  summary: "`Found ${items.length} member${items.length === 1 ? \"\" : \"s\"}`",
});
action({
  slug: "run-site-audit", name: "Run Site Audit", op: "site_audit_run",
  description: "Starts an SEO audit of a site now. Use the Site Audit Completed source to act on the result.",
  fields: [f("site_audit_run", "site_id", { pd: "siteId", required: true })],
  summary: "`Successfully started a site audit`",
});
action({
  slug: "get-latest-site-audit", name: "Get Latest Site Audit", op: "site_audit_history", read: true,
  description: "Gets the latest finished SEO audit of a site: its score, the pages crawled and the issues found and fixed.",
  fields: [f("site_audit_history", "site_id", { pd: "siteId", required: true })],
  fixedParams: { status: "complete", per_page: 1 },
  postCode: "const audit = (response || [])[0] || null;",
  returns: "audit",
  summary: "audit ? \"`Successfully retrieved the latest site audit`\" : \"`No finished site audit yet`\"",
});

// -- Experiments
action({
  slug: "find-experiments", name: "Find Experiments", op: "experiments_list", read: true, list: true,
  description: "Lists the experiments of a site, or finds one by name, with its status.",
  fields: [
    f("experiments_list", "site_id", { pd: "siteId", required: true }),
    { p: "name", api: "name", type: "string", virtual: true, label: "Name", description: "Part of the experiment name, not case sensitive." },
    f("experiments_list", "status", { default: "all" }), f("experiments_list", "kind"),
  ],
  postCode: "const wanted = (this.name || \"\").trim().toLowerCase();\n    if (wanted) items = items.filter((experiment) => String(experiment.name).toLowerCase().includes(wanted));",
  summary: "`Found ${items.length} experiment${items.length === 1 ? \"\" : \"s\"}`",
});
for (const [slug, name, op, text, done] of [
  ["start-experiment", "Start Experiment", "experiments_start", "Starts an A/B or split URL experiment.", "started"],
  ["pause-experiment", "Pause Experiment", "experiments_pause", "Pauses an experiment.", "paused"],
  ["end-experiment", "End Experiment", "experiments_end", "Ends an experiment, with or without a winner.", "ended"],
]) {
  action({
    slug, name, op, description: text,
    fields: [f(op, "site_id", { pd: "siteId", required: true }), { p: "experimentId", api: "id", in: "path", pd: "experimentId", required: true }],
    summary: `\`Successfully ${done} experiment '\${response.name}'\``,
  });
}

// -- Testimonials
const T = "testimonials_create";
action({
  slug: "create-testimonial", name: "Create Testimonial", op: T,
  description: "Adds a text testimonial, for example from a review, a support chat or a survey reply. It counts toward the monthly testimonials of the plan.",
  fixed: { kind: "text" },
  fields: [
    f(T, "site_id", { pd: "siteId", required: true }),
    f(T, "body", { required: true, label: "Text", description: "The words, up to 10,000 characters." }),
    f(T, "person_name", { required: true, description: "Who gave it." }),
    f(T, "person_email"), f(T, "person_title", { label: "Person Job Title" }), f(T, "person_company"),
    f(T, "person_company_url", { label: "Person Company URL" }), f(T, "person_social_url", { label: "Person Social URL" }),
    f(T, "rating", { options: ["1", "2", "3", "4", "5"], expr: "this.rating ? parseInt(this.rating, 10) : undefined", description: "The stars, 1 to 5. Leave it empty for no rating." }),
    f(T, "title"), f(T, "highlight"), f(T, "received_at", { description: "When it was given, as an ISO 8601 time. Defaults to now." }),
    f(T, "source_name"), f(T, "source_url", { label: "Source URL" }), f(T, "language"), f(T, "status", { default: "pending" }),
    f(T, "tags", { description: "Tag names or IDs. A name that does not exist yet is created." }),
    f(T, "collection_ids", { pd: "testimonialCollectionIds" }),
    f(T, "properties", { description: "Custom property values by key, as set up in the testimonial settings of the site, like `{\"plan\":\"pro\"}`." }),
    f(T, "pinned"), f(T, "external_id", { label: "External ID", description: "Your own ID for it, such as the review or ticket ID. Sending the same one again returns the testimonial already stored instead of a copy." }),
    f(T, "allow_duplicate"),
  ],
  summary: "`Successfully created the testimonial of '${this.personName}'`",
});
action({
  slug: "update-testimonial", name: "Update Testimonial", op: "testimonials_update",
  description: "Changes the words, rating, tags, custom properties and more of a testimonial. Only the fields filled in are changed.",
  fields: [
    f("testimonials_update", "site_id", { pd: "siteId", required: true }),
    { p: "testimonialId", api: "id", in: "path", pd: "testimonialId", required: true },
    f("testimonials_update", "body", { label: "Text" }), f("testimonials_update", "title"),
    f("testimonials_update", "rating", { options: ["1", "2", "3", "4", "5"], expr: "this.rating ? parseInt(this.rating, 10) : undefined" }),
    f("testimonials_update", "highlight"), f("testimonials_update", "language"), f("testimonials_update", "received_at"),
    f("testimonials_update", "source_name"), f("testimonials_update", "source_url", { label: "Source URL" }),
    f("testimonials_update", "properties", { description: "Custom property values to change, by key. An empty value clears one." }),
    f("testimonials_update", "add_tags", { description: "Tag names or IDs to add. A name that does not exist yet is created." }),
    f("testimonials_update", "remove_tags", { description: "Tag names or IDs to remove." }),
    f("testimonials_update", "edit_note"), f("testimonials_update", "permalink", { label: "Public Page" }),
  ],
  summary: "`Successfully updated testimonial ${this.testimonialId}`",
});
for (const [slug, name, op, text, done, fixed] of [
  ["approve-testimonial", "Approve Testimonial", "testimonials_approve", "Approves a testimonial, so it can be shown on walls and widgets.", "approved"],
  ["reject-testimonial", "Reject Testimonial", "testimonials_reject", "Rejects a testimonial.", "rejected"],
  ["return-testimonial-to-pending", "Return Testimonial to Pending", "testimonials_pend", "Returns a testimonial to pending, to be moderated again.", "returned to pending"],
]) {
  action({
    slug, name, op, description: text,
    fields: [f(op, "site_id", { pd: "siteId", required: true }), { p: "testimonialId", api: "id", in: "path", pd: "testimonialId", required: true }],
    summary: `\`Successfully ${done} testimonial \${this.testimonialId}\``,
  });
}
action({
  slug: "pin-testimonial", name: "Pin Testimonial", op: "testimonials_pin",
  description: "Pins a testimonial so it is shown first, or unpins it.",
  fields: [
    f("testimonials_pin", "site_id", { pd: "siteId", required: true }),
    { p: "testimonialId", api: "id", in: "path", pd: "testimonialId", required: true },
    f("testimonials_pin", "pinned", { default: true, description: "Whether the testimonial is pinned. Turn it off to unpin." }),
  ],
  summary: "`Successfully ${this.pinned === false ? \"unpinned\" : \"pinned\"} testimonial ${this.testimonialId}`",
});
action({
  slug: "get-testimonial", name: "Get Testimonial", op: "testimonials_get", read: true,
  description: "Gets one testimonial with everything about it, such as the person, the media and the tags.",
  fields: [f("testimonials_get", "site_id", { pd: "siteId", required: true }), { p: "testimonialId", api: "id", in: "path", pd: "testimonialId", required: true }],
  summary: "`Successfully retrieved testimonial ${this.testimonialId}`",
});
action({
  slug: "find-testimonials", name: "Find Testimonials", op: "testimonials_list", read: true, list: true,
  description: "Finds testimonials of a site by their words, status, rating, tag or form, newest first.",
  fields: [
    f("testimonials_list", "site_id", { pd: "siteId", required: true }),
    f("testimonials_list", "q", { label: "Search", description: "Words in the testimonial or the name or company of the person." }),
    f("testimonials_list", "status"),
    { p: "minRating", api: "min_rating", type: "string", virtual: true, label: "Minimum Rating", options: ["1", "2", "3", "4", "5"], description: "Only testimonials with at least this many stars." },
    f("testimonials_list", "kind"),
    f("testimonials_list", "tag_id", { pd: "testimonialTagIds" }),
    f("testimonials_list", "form_id", { pd: "testimonialFormIds" }),
    f("testimonials_list", "received_from", { expr: "utils.toDate(this.receivedFrom)", description: "The first day received, as `YYYY-MM-DD`." }),
    f("testimonials_list", "received_to", { expr: "utils.toDate(this.receivedTo)", description: "The last day received, as `YYYY-MM-DD`." }),
    f("testimonials_list", "sort", { options: ["received_desc", "received_asc", "added_desc", "added_asc", "rating_desc", "rating_asc", "person_asc", "relevance"] }),
  ],
  paramsCode: "rating: this.minRating ? [\"1\", \"2\", \"3\", \"4\", \"5\"].filter((rating) => Number(rating) >= Number(this.minRating)) : undefined",
  summary: "`Found ${items.length} testimonial${items.length === 1 ? \"\" : \"s\"}`",
});
action({
  slug: "create-testimonial-person", name: "Create Testimonial Person", op: "testimonial_people_create",
  description: "Adds a person (a customer who gives testimonials) to a site.",
  fields: [
    f("testimonial_people_create", "site_id", { pd: "siteId", required: true }), f("testimonial_people_create", "name", { required: true }),
    f("testimonial_people_create", "email"), f("testimonial_people_create", "title", { label: "Job Title" }), f("testimonial_people_create", "company"),
    f("testimonial_people_create", "company_url", { label: "Company URL" }), f("testimonial_people_create", "social_url", { label: "Social URL" }),
  ],
  summary: "`Successfully created person '${response.name}'`",
});
action({
  slug: "find-testimonial-people", name: "Find Testimonial People", op: "testimonial_people_list", read: true, list: true,
  description: "Finds the people of a site who give testimonials, by email or name.",
  fields: [f("testimonial_people_list", "site_id", { pd: "siteId", required: true }), f("testimonial_people_list", "query", { label: "Email or Name" }), f("testimonial_people_list", "company")],
  summary: "`Found ${items.length} ${items.length === 1 ? \"person\" : \"people\"}`",
});
action({
  slug: "ask-for-testimonial", name: "Ask for Testimonial", op: "testimonial_request_recipients_create", openWorld: true,
  description: "Adds a person to a testimonial request. In a running request they get the first email at once, in a draft they wait for it to be sent. Request emails need the Business plan and a connected email provider.",
  fields: [
    f("testimonial_request_recipients_create", "site_id", { pd: "siteId", required: true }),
    { p: "requestId", api: "request_id", in: "path", pd: "testimonialRequestId", required: true },
    { p: "email", api: "email", type: "string", virtual: true, required: true, label: "Email", description: "The address the request email goes to." },
    { p: "name", api: "name", type: "string", virtual: true, label: "Name", description: "Used in the email greeting and to fill in the form." },
    { p: "company", api: "company", type: "string", virtual: true, label: "Company", description: "The company of the person." },
    { p: "title", api: "title", type: "string", virtual: true, label: "Job Title", description: "The job title of the person." },
    { p: "properties", api: "properties", type: "object", virtual: true, label: "Properties", description: "Custom property values for the testimonial, by key, as set up in the testimonial settings of the site." },
  ],
  bodyCode: `recipients: [
          utils.compact({
            email: this.email,
            name: this.name,
            company: this.company,
            title: this.title,
            properties: utils.blank(this.properties) || !Object.keys(this.properties).length
              ? undefined
              : this.properties,
          }),
        ]`,
  summary: "response.added ? `Successfully added ${this.email} to the request` : `${this.email} was skipped`",
});

// ---------- code generation ----------

const q = (s) => JSON.stringify(s);

/** The value sent for a field: its expression, converted to the type the API reads. */
const valueOf = (fd) => {
  if (fd.expr) return fd.expr;
  const ref = `this.${fd.p}`;
  switch (fd.type) {
  case "list": return `utils.toList(${ref})`;
  case "json": return `utils.parseJson(${ref}, ${q(fd.label)})`;
  case "number": return `utils.toNumber(${ref})`;
  default: return ref;
  }
};

const propFor = (fd) => {
  if (fd.pd) {
    return `{ propDefinition: [app, ${q(fd.pd)}]${fd.pd === "siteId" || !fd.required ? "" : ""} }`;
  }
  const parts = [];
  const type = { list: "string[]", json: "string", number: "string" }[fd.type] || fd.type;
  parts.push(`type: ${q(type)}`, `label: ${q(fd.label)}`);
  if (fd.description) parts.push(`description: ${q(fd.description)}`);
  if (fd.options) {
    parts.push(`options: ${JSON.stringify(fd.options.map((o) => (Array.isArray(o) ? { label: o[1], value: o[0] } : o)))}`);
  }
  if (fd.default !== undefined) parts.push(`default: ${JSON.stringify(type === "integer" || type === "boolean" ? fd.default : String(fd.default))}`);
  if (!fd.required) parts.push("optional: true");
  return `{ ${parts.join(", ")} }`;
};

const generate = (def) => {
  const spc = spec[def.op];
  const fields = def.fields.map((fd) => ({ type: "string", ...fd }));
  const propsOut = [];
  for (const fd of fields) {
    if (fd.pd) {
      // A propDefinition is optional in the app file only where the app file says so.
      const needsOptional = !fd.required && !["testimonialFormIds", "testimonialTagIds", "testimonialCollectionIds", "segmentId", "from", "to", "filters", "maxResults"].includes(fd.pd);
      propsOut.push(`${fd.p}: { propDefinition: [app, ${q(fd.pd)}]${needsOptional ? ", optional: true" : ""} }`);
    } else {
      propsOut.push(`${fd.p}: ${propFor(fd)}`);
    }
  }
  if (def.list) propsOut.push("maxResults: { propDefinition: [app, \"maxResults\"] }");

  // Request pieces
  let pathTemplate = spc.path.replace(/\{(\w+)\}/g, (_m, name) => {
    if (name === "workspace_id") return "${workspaceId}";
    const fd = fields.find((x) => x.api === name);
    return `\${utils.segment(${valueOf(fd)})}`;
  });
  const pathLines = [];
  if (def.workspace || spc.path.includes("{workspace_id}")) pathLines.push("const workspaceId = await this.app.getWorkspaceId({ $ });");

  const inQuery = spc.method === "GET";
  const send = fields.filter((fd) => !fd.virtual && fd.in !== "path");
  const entries = send.map((fd) => `${fd.api}: ${valueOf(fd)}`);
  for (const [k, v] of Object.entries(def.fixed || {})) entries.push(`${k}: ${q(v)}`);
  for (const [k, v] of Object.entries(def.fixedParams || {})) entries.push(`${k}: ${q(v)}`);
  for (const [k, v] of Object.entries(def.fixedExpr || {})) {
    const at = entries.findIndex((e) => e.startsWith(`${k}:`));
    if (at >= 0) entries[at] = `${k}: ${v}`; else entries.push(`${k}: ${v}`);
  }
  if (def.paramsCode) entries.push(def.paramsCode);
  if (def.bodyCode) entries.push(def.bodyCode);

  const holder = inQuery ? "params" : "data";
  const lines = [...pathLines];
  const compactCall = `utils.compact({\n${entries.map((e) => `          ${e},`).join("\n")}\n        })`;

  let call;
  if (def.list) {
    call = `let items = await this.app.paginate({
      $,
      path: \`${pathTemplate}\`,
      params: ${compactCall},
      maxResults: ${def.postCode ? "Infinity" : "this.maxResults"},
    });`;
  } else {
    call = `const response = await this.app.request({
      $,
      method: ${q(spc.method)},
      path: \`${pathTemplate}\`,${entries.length ? `\n      ${holder}: ${compactCall},` : ""}
    });`;
  }
  lines.push(call);
  if (def.list && def.postCode) lines.push(def.postCode, "items = items.slice(0, this.maxResults);");
  else if (!def.list && def.postCode) lines.push(def.postCode);

  const returns = def.list ? "items" : (def.returns || "response");
  const summary = def.summary;
  lines.push(`$.export("$summary", ${summary.startsWith("`") || summary.includes("?") ? summary : q(summary)});`);
  lines.push(`return ${returns};`);

  const annotations = {
    destructiveHint: false,
    openWorldHint: Boolean(def.openWorld),
    readOnlyHint: Boolean(def.read),
  };
  const usesUtils = lines.join("\n").includes("utils.") || propsOut.join("").includes("utils.");

  return `import app from "../../privatus_analytics.app.mjs";
${usesUtils ? "import utils from \"../../common/utils.mjs\";\n" : ""}
export default {
  key: ${q(`privatus_analytics-${def.slug}`)},
  name: ${q(def.name)},
  description: ${q(`${def.description} [See the documentation](${DOCS})`)},
  version: "0.0.1",
  type: "action",
  annotations: ${JSON.stringify(annotations)},
  props: {
    app,
    ${propsOut.join(",\n    ")},
  },
  async run({ $ }) {
    ${lines.join("\n    ")}
  },
};
`;
};

fs.rmSync(outDir, { recursive: true, force: true });
for (const def of ACTIONS) {
  const dir = path.join(outDir, def.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${def.slug}.mjs`), generate(def));
}

// The one action that is written by hand.
const customDir = path.join(outDir, "send-custom-api-request");
fs.mkdirSync(customDir, { recursive: true });
fs.writeFileSync(path.join(customDir, "send-custom-api-request.mjs"), `import app from "../../privatus_analytics.app.mjs";
import utils from "../../common/utils.mjs";

export default {
  key: "privatus_analytics-send-custom-api-request",
  name: "Send Custom API Request",
  description: "Calls any endpoint of the Privatus Analytics API with the connected account, for what the other actions do not cover. Only paths on privatusanalytics.com are accepted. [See the documentation](${DOCS})",
  version: "0.0.1",
  type: "action",
  annotations: { destructiveHint: false, openWorldHint: false, readOnlyHint: false },
  props: {
    app,
    method: {
      type: "string",
      label: "HTTP Method",
      description: "The HTTP method. Nothing here can delete data, so \`DELETE\` is not offered.",
      options: ["GET", "PATCH", "POST", "PUT"],
      default: "GET",
    },
    path: {
      type: "string",
      label: "Path",
      description: "The path of the endpoint, like \`/sites/pa_7Q2K9XH3AB/stats/aggregate.json\`. \`.json\` is added when it is missing.",
    },
    query: {
      type: "object",
      label: "Query Parameters",
      description: "Query parameters, such as the name \`period\` with the value \`30d\`.",
      optional: true,
    },
    body: {
      type: "object",
      label: "Body",
      description: "The JSON body, for \`POST\`, \`PATCH\` and \`PUT\`.",
      optional: true,
    },
  },
  async run({ $ }) {
    const [base, existing] = utils.apiPath(this.path).split("?");
    const extra = this.query ? utils.queryString(this.query) : "";
    const search = [existing, extra].filter(Boolean).join("&");
    const response = await this.app._makeRequest({
      $,
      method: this.method,
      path: search ? base + "?" + search : base,
      data: this.method === "GET" ? undefined : this.body,
    });
    $.export("$summary", "Successfully sent the " + this.method + " request");
    return response;
  },
};
`);
ACTIONS.push({ slug: "send-custom-api-request" });
console.log(`Wrote ${ACTIONS.length} actions`);
