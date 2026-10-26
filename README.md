# Privatus Analytics for Pipedream

**Simple, private website analytics, at work in your Pipedream workflows.** No
cookies, honest numbers, and a dashboard you understand in seconds.

## Why Privatus Analytics

**Google Analytics is slow, confusing and hungry for data.** It sends what your
visitors do to Google. In many countries it means showing a cookie pop-up (the
box that asks visitors to accept cookies), and many people click "reject", so
you never see them. Bots pad the numbers that are left.

**Privatus Analytics fixes that.** It counts visits to your website without
cookies and never stores IP addresses. Bots are filtered out before they are
counted. Your data is never sold or shared.

What you get:

- **A dashboard you understand in seconds.** Visitors, top pages and where
  people came from, all on one screen.
- **No cookie pop-up needed for our analytics.** We set no cookies and store no
  personal data. Laws differ by country, so check your own legal advice.
- **Honest numbers.** Known bots and fake traffic are left out on every plan.
- **Your numbers where you work.** Send stats to Slack, Sheets or any app
  Pipedream connects to, and start a workflow when an alert fires or a
  testimonial comes in. No code needed.
- **Data you own.** We never sell it or show you ads, and you can pull it out
  any time through the API.

**Start free.** The Free plan has 10,000 events a month and 3 sites, with no
card. Every new account also gets 14 days of Pro free, with no card. [Create
your account](https://privatusanalytics.com).

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
