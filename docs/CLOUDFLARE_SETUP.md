# La Baraj — Cloudflare setup

Checked: 28 October 2026

## Current state

The owner completed signup while planning was in progress. The agent then verified the signed-in **Workers & Pages** dashboard: it shows **0 / 100,000 requests today** and **No projects found**. The browser is left on that dashboard. The agent did not enter a password, accept signup terms, select a paid plan or deploy a resource. Email-verification status was not separately checked.

## Signup steps, completed by the owner

1. On the open form, enter the email address you want to own the project.
2. Create your password directly in the browser. The observed form requires at least eight characters, a number, a special character and no leading/trailing whitespace. Do not paste the password into chat.
3. Review Cloudflare's terms and submit Sign up yourself. Complete any human verification and the email verification Cloudflare requests.
4. Once signed in, choose the developer / build applications route if asked. Open **Workers & Pages** (the exact navigation can change).
5. Stay on Workers Free. We need neither a paid website plan nor a transferred domain. Keep the free `workers.dev` hostname initially; Vercel can keep its `vercel.app` hostname.

If signup or the dashboard asks you to add a website, that is a different product path; find Workers & Pages rather than moving DNS. No R2, paid database, purchased domain or billing upgrade is required by our baseline. Report the actual screen if the free developer route is unclear.

## Next: authorize the local deployment tool during implementation

During implementation, install Wrangler from its official npm package as a local development dependency. Use its browser login flow on the owner's machine, review the requested access, and authorize it there. Keep resulting credentials out of this repository and chat. There is no reason to create or paste a broad API token just to start.

The intended commands, once `apps/server` actually exists and has a tested configuration, are:

```sh
cd apps/server
npx wrangler login
npx wrangler whoami
npx wrangler dev
npx wrangler deploy
```

These are future implementation steps, not commands already run. Review any new authorization grant at the time it is presented. [Official Wrangler getting-started guide](https://developers.cloudflare.com/workers/get-started/guide/)

## Required deployed shape

- Worker name `la-baraj-world`.
- PartyServer class `WorldRoom`, hibernation enabled.
- A Durable Object binding for that class, with `new_sqlite_classes` in the initial migration.
- A fixed production room, e.g. `cincis-main`; reject arbitrary room names.
- Worker secret for the private community invite / owner access as implemented. Store these server-side with Wrangler secrets, not in `VITE_*` variables.
- Exact production origin allowed once Vercel gives us the URL; separate development configuration.
- Separate development and production data; never test destructive resets against production cabins.

Durable Object storage is built into this setup. It is not a separate D1 database to provision. PartyServer is a package deployed to your own Cloudflare account, so there is no PartyKit account to register. [PartyServer setup](https://github.com/cloudflare/partykit/tree/main/packages/partyserver)

## Free plan and future spending

Begin with Workers Free. A 30-person session can fit the daily limits, but continuous movement messages accumulate; consult [the project's cost model](TECH_STACK.md#9-hosting-and-cost-model). No paid upgrade is authorized by this setup document.

Cloudflare's paid Workers plan starts at $5/month plus usage. It is a later owner decision if measured usage warrants it. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Signup handoff boundary

The owner enters the new password and completes its submission. The signup form also explicitly accepts Cloudflare's terms. Browser interaction policy requires owner handoff for new credentials and action-time confirmation for legal acceptance; the owner completing signup directly handles both. This is not an extra product approval gate or a requirement from the design skill.
