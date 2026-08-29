# Seahawks Fan Zone

Astro site for independent Seattle football coverage. These controls do not imply or guarantee AdSense account approval.

## Commands

- `npm run dev` starts Astro locally.
- `npm run build` refreshes NFL data and builds the site; the refresh scripts contact their configured upstream services.
- `npx astro build` builds from repository data without running the refresh scripts.

The homepage story feed treats stories published or materially updated within 14 days as current. Set `HOMEPAGE_STORY_FRESHNESS_DAYS` at build time to change that window; editors pin a current lead with the existing article `featured` field. `HOMEPAGE_FEED_NOW` is an optional ISO date override for deterministic previews of quiet-period fallback behavior.

## Advertising, analytics, and consent

Advertising defaults off. Production must explicitly set the applicable values:

```text
ADS_ENABLED=true
PUBLIC_ADSENSE_PUBLISHER_ID=ca-pub-<real numeric publisher ID>
PUBLIC_CMP_SCRIPT_URL=https://<Google Privacy & Messaging script URL>
ADS_TXT_RECORD=google.com, pub-<real numeric publisher ID>, DIRECT, f08c47fec0942fa0
PUBLIC_ADSENSE_ARTICLE_INLINE_SLOT=<real numeric slot ID>
PUBLIC_ADSENSE_ARTICLE_END_SLOT=<real numeric slot ID>
PUBLIC_ADSENSE_FEED_BREAK_SLOT=<real numeric slot ID>
PUBLIC_ADSENSE_DESKTOP_RAIL_SLOT=<real numeric slot ID, if used>
PUBLIC_ADSENSE_STATS_BREAK_SLOT=<real numeric slot ID, if used>
PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN=<real site token>
```

Do not commit production values. `ADS_ENABLED` must be exactly `true`; otherwise AdSense stays disabled. The publisher ID must be `ca-pub-` followed by digits, and each placement renders only when its real slot ID is also present. Analytics is independently disabled when its token is absent.

Configure Google Privacy & Messaging in the AdSense account. Copy its exact Google deployment URL into `PUBLIC_CMP_SCRIPT_URL`; do not implement or emulate TCF locally. Confirm that the message covers the EEA, UK, and Switzerland as required, presents fair choices, and supports withdrawal. The persistent **Manage Privacy Choices** footer link opens the Google Privacy & Messaging revocation UI. Test accept, reject, withdrawal, and non-GDPR regions before enabling ads.

At build completion, `ADS_TXT_RECORD` replaces the non-serving comments in the generated root `/ads.txt`. An invalid configured record fails the build. Confirm that the generated file uses the publisher ID assigned to the approved account and is reachable at the production domain root.

`BaseLayout` owns the centralized `window.sfzPrivacy` state and delays AdSense and optional Cloudflare browser analytics until the CMP reports an applicable choice. `SeahawksLayout` accepts `monetizationEligible={false}` for page-level exclusion. Privacy, disclosure, and 404 pages are always excluded; use the same prop for empty, under-construction, error, or other thin-content pages. Future ad slots must also check this state and must not obscure navigation or outweigh primary content.

Before launch:

1. Complete AdSense account and site review; do not assume approval.
2. Publish and verify the certified CMP configuration and privacy-choice reopening flow.
3. Verify the privacy, disclosure, and footer links on production.
4. Verify `/ads.txt` exactly matches the AdSense publisher ID.
5. Keep `ADS_ENABLED=false` until these checks pass.
6. Review AdSense Policy Center and resolve warnings before expanding placements.

<!-- Previous Astro starter documentation retained below for basic project structure. -->

```sh
npm create astro@latest -- --template minimal
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
