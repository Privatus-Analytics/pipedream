# Privatus Analytics for Pipedream

**Put your website stats and alerts to work in your Pipedream workflows.**

You want your website numbers to reach the tools your team uses, like a post in
your team chat each morning or a ticket when your site goes down. Doing it by
hand takes time every day.

These Pipedream components connect your workflows to Privatus Analytics. Actions
read stats and create goals, campaign links, uptime checks and more. Sources
start a workflow the moment an alert fires, a site goes down or a testimonial
comes in.

So reports and alerts go where your team already works, with no copy and paste.
The numbers are honest too. Privatus Analytics counts visits without cookies, so
there is no cookie pop-up for your analytics, and it leaves bots out.

**Free plan, no card:** 10,000 events a month (an event is a page view or an action you track) on up to 3 sites. [Start free at privatusanalytics.com](https://privatusanalytics.com).

## What this package does

Pipedream components that connect your workflows to the public [Privatus
Analytics API](https://privatusanalytics.com/docs/api) and its signed
[webhooks](https://privatusanalytics.com/docs/api/webhooks). They do not add a
tracking script. Your site still needs the Privatus Analytics script to collect
visits.

- **47 actions.** Read stats, top lists, time series and live visitors, and
  create or update goals, chart notes, campaign links and costs, uptime checks,
  status page updates, exports, invitations, site audits, experiments and
  testimonials. No action deletes data.
- **25 instant sources.** Start a workflow the moment an alert fires, an uptime
  check goes down, a testimonial comes in, an export is ready and more. Every
  delivery is checked against its signature before it is used.
- Data goes only to `https://privatusanalytics.com`.

You need a Privatus Analytics account and an API token. There is a free plan.
Sign up at https://privatusanalytics.com.

**Not on Pipedream yet.** The components are waiting for review as a [pull
request to the Pipedream
registry](https://github.com/PipedreamHQ/pipedream/pull/22294). Once it is
merged, they show up in Pipedream as the Privatus Analytics app.

## Ideas to try

- Send a weekly traffic report to Slack or email: run **Get Site Stats** on a
  schedule, compared with the week before.
- Post to a channel when an uptime check goes down: start from **New Uptime
  Check Down (Instant)**, then **Post Status Page Update**.
- Thank happy customers: start from **New Testimonial (Instant)** with a minimum
  rating of 5 stars, then **Approve Testimonial**.
- Mark every deploy on your charts: call **Create Chart Note** from your deploy
  workflow.

## Setup

1. In Privatus Analytics, open **Workspace settings**, then **API tokens**, and
   create a token. It starts with `pat_`.
2. For every action and source to work, keep all permissions, choose **Every
   site you can access** and set the expiry to **never**. The sources add a
   webhook, which needs the workspace settings permission and every site.
3. In Pipedream, connect the Privatus Analytics account and paste the token as
   the **API Token**.

A token belongs to exactly one workspace. Connect a second account for a second
workspace.

Deploying a source creates a webhook in your workspace. Deactivating or deleting
the source deletes it again.

The full list of actions and sources, and help when something goes wrong, is in
[components/privatus_analytics/README.md](components/privatus_analytics/README.md).

## Development

`components/privatus_analytics/` holds the components that go to Pipedream.
`tools/` and `tests/` are development files.

```sh
npm install
npm test           # unit tests: requests, signature checks, sources
npm run generate   # rewrite the actions and sources from tools/
```

After `npm run generate`, format the files with the ESLint setup of the
Pipedream repository (`npx eslint --fix components/privatus_analytics`).

## License

MIT. See [LICENSE](LICENSE).
