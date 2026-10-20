#!/usr/bin/env node
// Writes components/privatus_analytics/sources/<event>/ (the source and its
// test-event.mjs) for the 25 webhook events, from tools/events.json and
// tools/webhook-samples.json. Development tool, not part of the pull request.
//
//   node tools/generate-sources.mjs
//   npx eslint --fix components/privatus_analytics

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const events = JSON.parse(fs.readFileSync(path.join(here, "events.json"), "utf8"));
const samples = JSON.parse(fs.readFileSync(path.join(here, "webhook-samples.json"), "utf8"));
const outDir = path.join(here, "..", "components", "privatus_analytics", "sources");

const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// The text of each event in the list of events. `item` is the emitted item.
const SUMMARIES = {
  "alert.triggered": "`Alert triggered: ${item.name}`",
  "alert.resolved": "`Alert resolved: ${item.name}`",
  "goal.completed_threshold": "`Goal alert triggered: ${item.name}`",
  "usage.threshold": "`Usage alert triggered: ${item.name}`",
  "uptime.down": "`${item.check?.name || \"An uptime check\"} is down`",
  "uptime.up": "`${item.check?.name || \"An uptime check\"} is back up`",
  "site.created": "`New site: ${item.domain}`",
  "site.deleted": "`Site deleted: ${item.domain}`",
  "member.added": "`New member: ${item.email}`",
  "export.ready": "`Export ${item.export_id} is ready`",
  "import.completed": "`Analytics import completed (${item.rows_imported ?? 0} rows)`",
  "import.failed": "`Analytics import failed`",
  "site_audit.completed": "`Site audit completed with a score of ${item.score}`",
  "experiment.ended": "`Experiment '${item.name}' ended`",
  "testimonial.received": "`New testimonial from ${item.testimonial?.person?.name || \"someone\"}`",
  "testimonial.approved": "`Testimonial approved: ${item.testimonial?.id}`",
  "testimonial.rejected": "`Testimonial rejected: ${item.testimonial?.id}`",
  "testimonial.restored": "`Testimonial restored: ${item.testimonial?.id}`",
  "testimonial.trashed": "`Testimonial moved to trash: ${item.testimonial_id}`",
  "testimonial.deleted": "`Testimonial deleted: ${item.testimonial_id}`",
  "testimonial_form.submitted": "`Testimonial form submitted (${item.rating ? `${item.rating} stars` : \"no rating\"})`",
  "testimonial_request.sent": "`Testimonial request sent to ${item.recipients_count} people`",
  "testimonial_request.completed": "`Testimonial request finished`",
  "testimonial_import.finished": "`Testimonial import finished (${item.new ?? 0} new)`",
  "testimonial_sync.new_found": "`${item.new_count} new reviews found by sync`",
};

const idKeyOf = (event) => event.idKey || "record_id";

/** The emitted item of a sample delivery, the way the base source builds it. */
const sampleItem = (event) => {
  const data = { ...samples[event.value] };
  if (data.id !== undefined) { data[idKeyOf(event)] = data.id; delete data.id; }
  return {
    id: "whd_9K3M7QX2PL",
    event: event.value,
    occurred_at: "2026-10-20T10:15:00Z",
    workspace_id: "ws_5N8D2WLE4C",
    ...data,
  };
};

const q = JSON.stringify;

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, "common"), { recursive: true });
fs.copyFileSync(path.join(here, "base.mjs.txt"), path.join(outDir, "common", "base.mjs"));

for (const event of events) {
  const title = event.name.startsWith("New") ? event.name : `New ${event.name}`;
  const slug = `${slugOf(title)}-instant`;
  const dir = path.join(outDir, slug);
  fs.mkdirSync(dir, { recursive: true });

  const props = [];
  const checks = [];
  if (event.site) {
    props.push(`siteId: {
      propDefinition: [app, "siteId"],
      optional: true,
      description: "Only emit events of this site. Leave it empty for every site.",
    }`);
    checks.push("(!this.siteId || (item.site_id || item.check?.site_id) === this.siteId)");
  }
  if (event.filters.includes("alertId")) {
    props.push(`alertId: {
      propDefinition: [app, "alertId"],
      optional: true,
      description: "Only emit events of this alert rule. Leave it empty for every rule.",
    }`);
    checks.push("(!this.alertId || item.alert_id === this.alertId)");
  }
  if (event.filters.includes("formId")) {
    props.push(`formId: {
      propDefinition: [app, "testimonialFormId"],
      optional: true,
      description: "Only emit submissions of this form. Select a **Site** first. Leave it empty for every form.",
    }`);
    checks.push("(!this.formId || item.form_id === this.formId)");
  }
  if (event.filters.includes("requestId")) {
    props.push(`requestId: {
      propDefinition: [app, "testimonialRequestId"],
      optional: true,
      description: "Only emit events of this request. Select a **Site** first. Leave it empty for every request.",
    }`);
    checks.push("(!this.requestId || item.request_id === this.requestId)");
  }
  if (event.filters.includes("minRating")) {
    props.push(`minRating: {
      type: "string",
      label: "Minimum Rating",
      description: "Only emit ratings of at least this many stars. Leave it empty to emit every one, with or without a rating.",
      options: ["1", "2", "3", "4", "5"],
      optional: true,
    }`);
    checks.push("(!this.minRating || this.getRating(item) >= Number(this.minRating))");
  }

  const text = event.description.replace(/^Triggers when /, "");
  const usesApp = props.length > 0;
  const summary = SUMMARIES[event.value];
  const code = `${usesApp ? "import app from \"../../privatus_analytics.app.mjs\";\n" : ""}import common from "../common/base.mjs";
import sampleEmit from "./test-event.mjs";

export default {
  ...common,
  key: ${q(`privatus_analytics-${slug}`)},
  name: ${q(`${title} (Instant)`)},
  description: ${q(`Emit new event when ${text}. [See the documentation](https://privatusanalytics.com/docs/api/webhooks)`)},
  version: "0.0.1",
  type: "source",
  dedupe: "unique",
  props: {
    ...common.props,
    ${props.join(",\n    ")}${props.length ? "," : ""}
  },
  methods: {
    ...common.methods,
    getEvent() {
      return ${q(event.value)};
    },${event.idKey ? `
    getIdKey() {
      return ${q(event.idKey)};
    },` : ""}
    getSummary(${summary.includes("item") ? "item" : ""}) {
      return ${summary};
    },${checks.length ? `
    isRelevant(item) {
      return ${checks.join("\n        && ")};
    },` : ""}
  },
  sampleEmit,
};
`;
  fs.writeFileSync(path.join(dir, `${slug}.mjs`), code);
  fs.writeFileSync(path.join(dir, "test-event.mjs"), `export default ${JSON.stringify(sampleItem(event), null, 2)};\n`);
}
console.log(`Wrote ${events.length} sources`);
