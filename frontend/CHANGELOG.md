## [0.24.1](https://github.com/quantti/tapas-fpl-app/compare/v0.24.0...v0.24.1) (2026-01-08)


### Bug Fixes

* **backend:** resolve code review issues in history service ([f7555e0](https://github.com/quantti/tapas-fpl-app/commit/f7555e0d729d0add0e95e24fb61a2e0f2667950b))
* **frontend:** add browser headers to FPL proxy and SPA rewrites ([f132259](https://github.com/quantti/tapas-fpl-app/commit/f13225979887841150fef19ef4d2ef44b23f7959))
* restore SPA routing and improve local dev compatibility ([9cefd9a](https://github.com/quantti/tapas-fpl-app/commit/9cefd9a7ac8f59d39415feded4bff5efa486b3b3))

# [0.24.0](https://github.com/quantti/tapas-fpl-app/compare/v0.23.3...v0.24.0) (2026-01-07)


### Features

* **backend:** add scheduled updates infrastructure ([b60aca0](https://github.com/quantti/tapas-fpl-app/commit/b60aca0ec01d3a7452df9eed30c40564b282656f))

## [0.23.3](https://github.com/quantti/tapas-fpl-app/compare/v0.23.2...v0.23.3) (2026-01-06)


### Bug Fixes

* enable TanStack Query retries for manager data fetching ([987152c](https://github.com/quantti/tapas-fpl-app/commit/987152c7b3160c254302cbc7b12d3dd2d39abfef))

## [0.23.2](https://github.com/quantti/tapas-fpl-app/compare/v0.23.1...v0.23.2) (2026-01-06)


### Bug Fixes

* **tests:** regenerate snapshots with Docker for CI consistency ([4e211a2](https://github.com/quantti/tapas-fpl-app/commit/4e211a2a1bcc784e2f18abdd17cd9105f61f6bc4))

## [0.23.1](https://github.com/quantti/tapas-fpl-app/compare/v0.23.0...v0.23.1) (2026-01-06)


### Bug Fixes

* **tests:** correct API route patterns in E2E test fixtures ([aa02995](https://github.com/quantti/tapas-fpl-app/commit/aa02995420d9a1a2b69244e9f29da038834ba6f6))

# [0.23.0](https://github.com/quantti/tapas-fpl-app/compare/v0.22.0...v0.23.0) (2026-01-06)


### Features

* **chips:** integrate frontend with backend chips API ([938911b](https://github.com/quantti/tapas-fpl-app/commit/938911bb243c3ef34e18ef802311e32f30abdadc))

# [0.22.0](https://github.com/quantti/tapas-fpl-app/compare/v0.21.0...v0.22.0) (2026-01-06)


### Bug Fixes

* **points-against:** correct database PK and collection bugs ([496a9d5](https://github.com/quantti/tapas-fpl-app/commit/496a9d5b15e406f7ede8331761c41b6027e379b9))


### Features

* **chips:** integrate frontend with backend chips API ([d157c6d](https://github.com/quantti/tapas-fpl-app/commit/d157c6debca431df198e5979577628449a488478))

# [0.22.0](https://github.com/quantti/tapas-fpl-app/compare/v0.21.0...v0.22.0) (2026-01-06)


### Bug Fixes

* **points-against:** correct database PK and collection bugs ([496a9d5](https://github.com/quantti/tapas-fpl-app/commit/496a9d5b15e406f7ede8331761c41b6027e379b9))


### Features

* **chips:** integrate frontend with backend chips API ([d157c6d](https://github.com/quantti/tapas-fpl-app/commit/d157c6debca431df198e5979577628449a488478))

# [0.21.0](https://github.com/quantti/tapas-fpl-app/compare/v0.20.0...v0.21.0) (2026-01-05)


### Bug Fixes

* **backend:** update chip_usage migration to replace old table ([de57db2](https://github.com/quantti/tapas-fpl-app/commit/de57db26cd60cead0a798579dfc15c741821eefd))


### Features

* **backend:** add chip_usage schema for Chips Remaining feature ([4ea368e](https://github.com/quantti/tapas-fpl-app/commit/4ea368e326be1b9b988a281e6241ba7288a6c397))
* **backend:** add on-demand chip sync from FPL API ([5febb86](https://github.com/quantti/tapas-fpl-app/commit/5febb864e9e3af888a224271f396380d1266759e))
* **backend:** implement chips remaining service and API endpoints ([4c25117](https://github.com/quantti/tapas-fpl-app/commit/4c2511766fc9740c3bbf658b80b8fd264f21396d))

# [0.20.0](https://github.com/quantti/tapas-fpl-app/compare/v0.19.0...v0.20.0) (2026-01-05)


### Bug Fixes

* **queries:** resolve query key collision between usePositionBreakdown and useHistoricalData ([59c6a94](https://github.com/quantti/tapas-fpl-app/commit/59c6a94769a60de80eaccb84f148ce8a3a032120))


### Features

* **backend:** store player fixture stats during data collection ([146dbf5](https://github.com/quantti/tapas-fpl-app/commit/146dbf512ca752656d1dd1632b39639a52bc2599))

# [0.20.0](https://github.com/quantti/tapas-fpl-app/compare/v0.19.0...v0.20.0) (2026-01-05)


### Bug Fixes

* **queries:** resolve query key collision between usePositionBreakdown and useHistoricalData


### Refactor

* **components:** create unified CardRow component with CSS Grid
  - Consistent row styling across 6 cards (BenchPoints, CaptainSuccess, StatsCards, ChipsRemaining, FreeTransfers, GameweekDetails)
  - Add color gradient for Free Transfers (1 FT gray → 5 FT gold)
  - Add WCAG AA compliant `--color-gold` CSS variable
  - Add chevron hover animation for clickable rows
  - Remove deprecated RankedRow component


### Chore

* **analytics:** temporarily hide Points Against card (no data yet)


# [0.19.0](https://github.com/quantti/tapas-fpl-app/compare/v0.18.1...v0.19.0) (2026-01-03)


### Bug Fixes

* **useFplData:** subtract bank from squad value ([c855b25](https://github.com/quantti/tapas-fpl-app/commit/c855b2505839f076902ae4e07d670bf0b2820c45))


### Features

* **backend:** add Points Against API with data collection ([7889439](https://github.com/quantti/tapas-fpl-app/commit/7889439641255d50563b6fd4dbcf342e80d67793))
* **dev:** add local development script with backend + frontend ([3a7d44e](https://github.com/quantti/tapas-fpl-app/commit/3a7d44edcfd3d325ddef1dcaf86c6dfca5f77e13))
* **dev:** add start:prod script and document local development ([cddbc30](https://github.com/quantti/tapas-fpl-app/commit/cddbc3022dcac902000b737b13dc52ee225f9206))
* **frontend:** add Points Against card to Analytics view ([ebd3bd6](https://github.com/quantti/tapas-fpl-app/commit/ebd3bd6cdc963662d523bca4833a0bb1e2f4ca33))

## [0.18.1](https://github.com/quantti/tapas-fpl-app/compare/v0.18.0...v0.18.1) (2026-01-03)


### Bug Fixes

* use relative import for config module ([14c0d54](https://github.com/quantti/tapas-fpl-app/commit/14c0d5419a11caffda1f9be8a5a358df23039c67))

# [0.18.0](https://github.com/quantti/tapas-fpl-app/compare/v0.17.0...v0.18.0) (2026-01-03)


### Bug Fixes

* **FplUpdating:** correct message timing reference ([959ecd7](https://github.com/quantti/tapas-fpl-app/commit/959ecd7bbb36ee607a4dc075deb2e6ce0d0a62ef))


### Features

* **backend:** add local dev setup for points against feature ([f3f3bf2](https://github.com/quantti/tapas-fpl-app/commit/f3f3bf263e4c7d758cb93f81c7799187b7d00569))

# [0.17.0](https://github.com/quantti/tapas-fpl-app/compare/v0.16.3...v0.17.0) (2026-01-02)


### Features

* **h2h:** add squad overlap, differentials, and gameweek extremes ([914ee71](https://github.com/quantti/tapas-fpl-app/commit/914ee71969c919e4f33392b23b9ff0b067bcdf3a))

## [0.17.1](https://github.com/quantti/tapas-fpl-app/compare/v0.17.0...v0.17.1) (2026-01-02)


### Bug Fixes

* **h2h:** align template overlap boxes and add subtitle ([7f9a19b](https://github.com/quantti/tapas-fpl-app/commit/7f9a19b5b3c5d9c8aa29a9eba4fe400a7f8d10e5))

# [0.17.0](https://github.com/quantti/tapas-fpl-app/compare/v0.16.2...v0.17.0) (2026-01-02)


### Features

* **h2h:** add world template team comparison ([aab42fa](https://github.com/quantti/tapas-fpl-app/commit/aab42faf7dc5ad6d8e48470bf3a9f285ae4ee662))

## [0.16.2](https://github.com/quantti/tapas-fpl-app/compare/v0.16.1...v0.16.2) (2026-01-02)


### Bug Fixes

* **tests:** update flaky test to look for Finance card ([b75afab](https://github.com/quantti/tapas-fpl-app/commit/b75afabb957b8823421e9a5c9f25f716fb982fb4))

## [0.16.1](https://github.com/quantti/tapas-fpl-app/compare/v0.16.0...v0.16.1) (2026-01-02)


### Bug Fixes

* **header:** make logo clickable to navigate to dashboard ([a3a28e0](https://github.com/quantti/tapas-fpl-app/commit/a3a28e0b21a22b101c81057e4d0f319a34110289))
* **release:** update version script to use releases.ts ([fcb8f24](https://github.com/quantti/tapas-fpl-app/commit/fcb8f243c2c9f1781a9b9e5da72eef7d55352403))

# [0.16.0](https://github.com/quantti/tapas-fpl-app/compare/v0.15.1...v0.16.0) (2026-01-02)


### Bug Fixes

* **analytics:** improve error handling and add missing tests ([52f5cff](https://github.com/quantti/tapas-fpl-app/commit/52f5cffcc03a2f5a4e617b10ca28354f08800c75))
* **head-to-head:** prevent scroll jump and auto-scroll to comparison ([ce6267a](https://github.com/quantti/tapas-fpl-app/commit/ce6267ad6ae7110c4541524bca1cf6108075f7dd))
* **queries:** handle only 404 errors in useHistoricalData ([5b5fc8b](https://github.com/quantti/tapas-fpl-app/commit/5b5fc8b9fad4da46973f97462fe95b052d035a83))


### Features

* **analytics:** add head-to-head manager comparison ([5c19591](https://github.com/quantti/tapas-fpl-app/commit/5c195912fd1523ffdeaf8800f37574bb6247a270))

## [1.1.1](https://github.com/quantti/tapas-fpl-app/compare/v1.1.0...v1.1.1) (2026-01-02)


### Bug Fixes

* filter undefined values from managerDetails to prevent Statistics crash on reload ([3b4a49d](https://github.com/quantti/tapas-fpl-app/commit/3b4a49d3ab72e4207d72f72aface3ff743af3fbc))

# [1.1.0](https://github.com/quantti/tapas-fpl-app/compare/v1.0.0...v1.1.0) (2026-01-02)


### Bug Fixes

* **Account:** add validation error states for manager ID input ([647b2a4](https://github.com/quantti/tapas-fpl-app/commit/647b2a4e294044268ba078700153c18f60c2460a))
* add defensive check for missing fixture stats array ([610cb8b](https://github.com/quantti/tapas-fpl-app/commit/610cb8be32ae54d7a18a25d655d8a3878d9b480d))
* add missing EntryPicksResponse type export for positionBreakdownUtils ([627aa8d](https://github.com/quantti/tapas-fpl-app/commit/627aa8da728855e51df4963d801ecfb398992e6d))
* **ci:** add format:check script for CI pipeline ([66e9a6c](https://github.com/quantti/tapas-fpl-app/commit/66e9a6c0e1f61119675c4a2d2247880d7be8ee94))
* improve Free Transfers calculation accuracy ([0f20f32](https://github.com/quantti/tapas-fpl-app/commit/0f20f32514fca235e57d2a1a182afb45f5249cf9))
* **modal:** use reactive live data for real-time player score updates ([ca9451e](https://github.com/quantti/tapas-fpl-app/commit/ca9451ef143ea76d2543f0df6479834a768403a5))
* **PitchPlayer:** rename -bench modifier to bench for CSS types compatibility ([2460587](https://github.com/quantti/tapas-fpl-app/commit/2460587576ffd1c92a11ecea5f224f97e312354d))
* reduce bootstrap-static cache TTL from 6h to 5min ([61665df](https://github.com/quantti/tapas-fpl-app/commit/61665df4175469a39e3b63b71505e2aa042bb061))
* remove double hit deduction from live GW points ([a3f3e3b](https://github.com/quantti/tapas-fpl-app/commit/a3f3e3bb7c87c1dd79f8cd0bf48766d797d85b0e))
* rename format scripts for consistency ([0637ce2](https://github.com/quantti/tapas-fpl-app/commit/0637ce2997f8adc4f1a46709e61122bc96ebc8b2))
* resolve TypeScript error with dynamic CSS module access ([5990ed0](https://github.com/quantti/tapas-fpl-app/commit/5990ed045ee07e06f9838a25cdf8055c389eb331))
* resolve TypeScript errors from CI ([c59d773](https://github.com/quantti/tapas-fpl-app/commit/c59d77343efcb4eed2436d36a7632bea45a008fb))
* show remaining FT and hide arrows when GW hasn't started ([d9d9219](https://github.com/quantti/tapas-fpl-app/commit/d9d9219d5b786b6d7cf9b5dea2b094d553a55caa))
* use explicit property declarations for FplApiError class ([bdf678e](https://github.com/quantti/tapas-fpl-app/commit/bdf678e0f69461a57a1db15d37415e180649cbaf))


### Features

* **a11y:** add accessibility testing and fix color contrast issues ([dcc9d8f](https://github.com/quantti/tapas-fpl-app/commit/dcc9d8f5c6f767ecd086ea9bd2cdbd65d9b82968))
* add Account page with manager ID cookie storage ([557ef7b](https://github.com/quantti/tapas-fpl-app/commit/557ef7b18d2ab98452f0003e8bef0678822de9ba))
* add changelog page with release notes automation ([efc6a25](https://github.com/quantti/tapas-fpl-app/commit/efc6a257477097196d665a05253328de2f1d84f6))
* add footer with copyright ([8743698](https://github.com/quantti/tapas-fpl-app/commit/8743698209c67e1371e2f5050354ad6b05dbe5d7))
* add GDPR cookie consent banner ([2a113de](https://github.com/quantti/tapas-fpl-app/commit/2a113de7ab0a5a2c5dd102726958221bd1c72b33))
* add graceful error handling for FPL API 503 responses ([70bc8c2](https://github.com/quantti/tapas-fpl-app/commit/70bc8c29c438cf36f102f4d40c1dc2b9f3080d26))
* add league recalculation warning banner ([8c84acc](https://github.com/quantti/tapas-fpl-app/commit/8c84accc43a2c35133ad6701939db5dc4d81d0ad))
* add live provisional bonus to GameRewards component ([bd80e18](https://github.com/quantti/tapas-fpl-app/commit/bd80e18e45e01c0ad3733b1ef3b8f78348f0b608))
* add player modal with history enhancements ([0f3bca0](https://github.com/quantti/tapas-fpl-app/commit/0f3bca003a235ac8a238773e659fd63d524e1176))
* add release notification banner ([eb82b7f](https://github.com/quantti/tapas-fpl-app/commit/eb82b7f75a602dba6f98bc9665e8bd665b3a2cfb))
* add roadmap page and fix layout consistency ([84454fb](https://github.com/quantti/tapas-fpl-app/commit/84454fb69a83d52ae8d6f1716a9ddeab05f79566))
* **dashboard:** add Game Rewards card with bonus and DefCon points ([ea29cee](https://github.com/quantti/tapas-fpl-app/commit/ea29cee9777e982711a30f32bd7b16e9ca8250b2))
* **live:** add local auto-substitution calculation ([fabaa46](https://github.com/quantti/tapas-fpl-app/commit/fabaa46d3db78bea0c2ccc9d1793f248cb95759f))
* **PersonalStats:** add position breakdown showing points by GK/DEF/MID/FWD ([900a91d](https://github.com/quantti/tapas-fpl-app/commit/900a91dc116e61791d62ae2456949829dc113f91))
* **statistics:** add Free Transfers Tracker card ([e530396](https://github.com/quantti/tapas-fpl-app/commit/e5303960e22d898ac7659331fdfb81411d889129))

# [0.14.0](https://github.com/quantti/tapas-fpl-app/compare/v0.13.0...v0.14.0) (2026-01-02)


### Bug Fixes

* **Account:** add validation error states for manager ID input ([647b2a4](https://github.com/quantti/tapas-fpl-app/commit/647b2a4e294044268ba078700153c18f60c2460a))
* add missing EntryPicksResponse type export for positionBreakdownUtils ([627aa8d](https://github.com/quantti/tapas-fpl-app/commit/627aa8da728855e51df4963d801ecfb398992e6d))
* resolve TypeScript error with dynamic CSS module access ([5990ed0](https://github.com/quantti/tapas-fpl-app/commit/5990ed045ee07e06f9838a25cdf8055c389eb331))


### Features

* add Account page with manager ID cookie storage ([557ef7b](https://github.com/quantti/tapas-fpl-app/commit/557ef7b18d2ab98452f0003e8bef0678822de9ba))
* add GDPR cookie consent banner ([2a113de](https://github.com/quantti/tapas-fpl-app/commit/2a113de7ab0a5a2c5dd102726958221bd1c72b33))
* add player modal with history enhancements ([0f3bca0](https://github.com/quantti/tapas-fpl-app/commit/0f3bca003a235ac8a238773e659fd63d524e1176))
* add release notification banner ([eb82b7f](https://github.com/quantti/tapas-fpl-app/commit/eb82b7f75a602dba6f98bc9665e8bd665b3a2cfb))
* **PersonalStats:** add position breakdown showing points by GK/DEF/MID/FWD ([900a91d](https://github.com/quantti/tapas-fpl-app/commit/900a91dc116e61791d62ae2456949829dc113f91))

# [0.14.0](https://github.com/quantti/tapas-fpl-app/compare/v0.13.0...v0.14.0) (2026-01-02)


### Bug Fixes

* **Account:** add validation error states for manager ID input ([647b2a4](https://github.com/quantti/tapas-fpl-app/commit/647b2a4e294044268ba078700153c18f60c2460a))
* resolve TypeScript error with dynamic CSS module access ([5990ed0](https://github.com/quantti/tapas-fpl-app/commit/5990ed045ee07e06f9838a25cdf8055c389eb331))


### Features

* add Account page with manager ID cookie storage ([557ef7b](https://github.com/quantti/tapas-fpl-app/commit/557ef7b18d2ab98452f0003e8bef0678822de9ba))
* add GDPR cookie consent banner ([2a113de](https://github.com/quantti/tapas-fpl-app/commit/2a113de7ab0a5a2c5dd102726958221bd1c72b33))
* add player modal with history enhancements ([0f3bca0](https://github.com/quantti/tapas-fpl-app/commit/0f3bca003a235ac8a238773e659fd63d524e1176))
* add release notification banner ([eb82b7f](https://github.com/quantti/tapas-fpl-app/commit/eb82b7f75a602dba6f98bc9665e8bd665b3a2cfb))
* **PersonalStats:** add position breakdown showing points by GK/DEF/MID/FWD ([900a91d](https://github.com/quantti/tapas-fpl-app/commit/900a91dc116e61791d62ae2456949829dc113f91))

# [0.14.0](https://github.com/quantti/tapas-fpl-app/compare/v0.13.0...v0.14.0) (2026-01-01)


### Bug Fixes

* resolve TypeScript error with dynamic CSS module access ([5990ed0](https://github.com/quantti/tapas-fpl-app/commit/5990ed045ee07e06f9838a25cdf8055c389eb331))


### Features

* add GDPR cookie consent banner ([2a113de](https://github.com/quantti/tapas-fpl-app/commit/2a113de7ab0a5a2c5dd102726958221bd1c72b33))
* add player modal with history enhancements ([0f3bca0](https://github.com/quantti/tapas-fpl-app/commit/0f3bca003a235ac8a238773e659fd63d524e1176))
* add release notification banner ([eb82b7f](https://github.com/quantti/tapas-fpl-app/commit/eb82b7f75a602dba6f98bc9665e8bd665b3a2cfb))

# [0.14.0](https://github.com/quantti/tapas-fpl-app/compare/v0.13.0...v0.14.0) (2025-12-31)


### Features

* add GDPR cookie consent banner ([2a113de](https://github.com/quantti/tapas-fpl-app/commit/2a113de7ab0a5a2c5dd102726958221bd1c72b33))
* add player modal with history enhancements ([0f3bca0](https://github.com/quantti/tapas-fpl-app/commit/0f3bca003a235ac8a238773e659fd63d524e1176))
* add release notification banner ([eb82b7f](https://github.com/quantti/tapas-fpl-app/commit/eb82b7f75a602dba6f98bc9665e8bd665b3a2cfb))

# [0.14.0](https://github.com/quantti/tapas-fpl-app/compare/v0.13.0...v0.14.0) (2025-12-31)


### Features

* add GDPR cookie consent banner ([2a113de](https://github.com/quantti/tapas-fpl-app/commit/2a113de7ab0a5a2c5dd102726958221bd1c72b33))
* add player modal with history enhancements ([0f3bca0](https://github.com/quantti/tapas-fpl-app/commit/0f3bca003a235ac8a238773e659fd63d524e1176))
* add release notification banner ([eb82b7f](https://github.com/quantti/tapas-fpl-app/commit/eb82b7f75a602dba6f98bc9665e8bd665b3a2cfb))

# [0.14.0](https://github.com/quantti/tapas-fpl-app/compare/v0.13.0...v0.14.0) (2025-12-31)


### Features

* add GDPR cookie consent banner ([2a113de](https://github.com/quantti/tapas-fpl-app/commit/2a113de7ab0a5a2c5dd102726958221bd1c72b33))
* add player modal with history enhancements ([0f3bca0](https://github.com/quantti/tapas-fpl-app/commit/0f3bca003a235ac8a238773e659fd63d524e1176))
* add release notification banner ([eb82b7f](https://github.com/quantti/tapas-fpl-app/commit/eb82b7f75a602dba6f98bc9665e8bd665b3a2cfb))

# [0.13.0](https://github.com/quantti/tapas-fpl-app/compare/v0.12.0...v0.13.0) (2025-12-31)


### Bug Fixes

* **modal:** use reactive live data for real-time player score updates ([ca9451e](https://github.com/quantti/tapas-fpl-app/commit/ca9451ef143ea76d2543f0df6479834a768403a5))


### Features

* add changelog page with release notes automation ([efc6a25](https://github.com/quantti/tapas-fpl-app/commit/efc6a257477097196d665a05253328de2f1d84f6))

# [0.12.0](https://github.com/quantti/tapas-fpl-app/compare/v0.11.1...v0.12.0) (2025-12-30)


### Features

* add league recalculation warning banner ([8c84acc](https://github.com/quantti/tapas-fpl-app/commit/8c84accc43a2c35133ad6701939db5dc4d81d0ad))

## [0.11.1](https://github.com/quantti/tapas-fpl-app/compare/v0.11.0...v0.11.1) (2025-12-30)


### Bug Fixes

* resolve TypeScript errors from CI ([c59d773](https://github.com/quantti/tapas-fpl-app/commit/c59d77343efcb4eed2436d36a7632bea45a008fb))

# [0.11.0](https://github.com/quantti/tapas-fpl-app/compare/v0.10.0...v0.11.0) (2025-12-30)


### Features

* add live provisional bonus to GameRewards component ([bd80e18](https://github.com/quantti/tapas-fpl-app/commit/bd80e18e45e01c0ad3733b1ef3b8f78348f0b608))

# [0.10.0](https://github.com/quantti/tapas-fpl-app/compare/v0.9.1...v0.10.0) (2025-12-30)


### Features

* add roadmap page and fix layout consistency ([84454fb](https://github.com/quantti/tapas-fpl-app/commit/84454fb69a83d52ae8d6f1716a9ddeab05f79566))

## [0.9.1](https://github.com/quantti/tapas-fpl-app/compare/v0.9.0...v0.9.1) (2025-12-29)


### Bug Fixes

* add defensive check for missing fixture stats array ([610cb8b](https://github.com/quantti/tapas-fpl-app/commit/610cb8be32ae54d7a18a25d655d8a3878d9b480d))

# [0.9.0](https://github.com/quantti/tapas-fpl-app/compare/v0.8.0...v0.9.0) (2025-12-29)


### Features

* **dashboard:** add Game Rewards card with bonus and DefCon points ([ea29cee](https://github.com/quantti/tapas-fpl-app/commit/ea29cee9777e982711a30f32bd7b16e9ca8250b2))
* **live:** add local auto-substitution calculation ([fabaa46](https://github.com/quantti/tapas-fpl-app/commit/fabaa46d3db78bea0c2ccc9d1793f248cb95759f))

# [0.8.0](https://github.com/quantti/tapas-fpl-app/compare/v0.7.1...v0.8.0) (2025-12-27)


### Bug Fixes

* remove double hit deduction from live GW points ([a3f3e3b](https://github.com/quantti/tapas-fpl-app/commit/a3f3e3bb7c87c1dd79f8cd0bf48766d797d85b0e))
* rename format scripts for consistency ([0637ce2](https://github.com/quantti/tapas-fpl-app/commit/0637ce2997f8adc4f1a46709e61122bc96ebc8b2))


### Features

* **a11y:** add accessibility testing and fix color contrast issues ([dcc9d8f](https://github.com/quantti/tapas-fpl-app/commit/dcc9d8f5c6f767ecd086ea9bd2cdbd65d9b82968))

## [0.7.1](https://github.com/quantti/tapas-fpl-app/compare/v0.7.0...v0.7.1) (2025-12-26)


### Bug Fixes

* use explicit property declarations for FplApiError class ([bdf678e](https://github.com/quantti/tapas-fpl-app/commit/bdf678e0f69461a57a1db15d37415e180649cbaf))

# [0.7.0](https://github.com/quantti/tapas-fpl-app/compare/v0.6.4...v0.7.0) (2025-12-26)


### Features

* add graceful error handling for FPL API 503 responses ([70bc8c2](https://github.com/quantti/tapas-fpl-app/commit/70bc8c29c438cf36f102f4d40c1dc2b9f3080d26))

## [0.6.4](https://github.com/quantti/tapas-fpl-app/compare/v0.6.3...v0.6.4) (2025-12-26)


### Bug Fixes

* improve Free Transfers calculation accuracy ([0f20f32](https://github.com/quantti/tapas-fpl-app/commit/0f20f32514fca235e57d2a1a182afb45f5249cf9))
* reduce bootstrap-static cache TTL from 6h to 5min ([61665df](https://github.com/quantti/tapas-fpl-app/commit/61665df4175469a39e3b63b71505e2aa042bb061))

## [0.6.3](https://github.com/quantti/tapas-fpl-app/compare/v0.6.2...v0.6.3) (2025-12-26)


### Bug Fixes

* show remaining FT and hide arrows when GW hasn't started ([d9d9219](https://github.com/quantti/tapas-fpl-app/commit/d9d9219d5b786b6d7cf9b5dea2b094d553a55caa))

## [0.6.2](https://github.com/quantti/tapas-fpl-app/compare/v0.6.1...v0.6.2) (2025-12-26)


### Bug Fixes

* **ci:** add format:check script for CI pipeline ([66e9a6c](https://github.com/quantti/tapas-fpl-app/commit/66e9a6c0e1f61119675c4a2d2247880d7be8ee94))

## [0.6.1](https://github.com/quantti/tapas-fpl-app/compare/v0.6.0...v0.6.1) (2025-12-26)


### Bug Fixes

* **PitchPlayer:** rename -bench modifier to bench for CSS types compatibility ([2460587](https://github.com/quantti/tapas-fpl-app/commit/2460587576ffd1c92a11ecea5f224f97e312354d))

# [0.6.0](https://github.com/quantti/tapas-fpl-app/compare/v0.5.0...v0.6.0) (2025-12-26)


### Features

* add footer with copyright ([8743698](https://github.com/quantti/tapas-fpl-app/commit/8743698209c67e1371e2f5050354ad6b05dbe5d7))
* **statistics:** add Free Transfers Tracker card ([e530396](https://github.com/quantti/tapas-fpl-app/commit/e5303960e22d898ac7659331fdfb81411d889129))

# 0.5.0 (2025-12-26)


### Bug Fixes

* add gap between sidebar sections ([d01086c](https://github.com/quantti/tapas-fpl-app/commit/d01086c9934206ebe66a1be00ef111a38affd966))
* add SPA rewrites for client-side routing ([5cc4d95](https://github.com/quantti/tapas-fpl-app/commit/5cc4d95fa2e9305b66765406e0d994deec59a4a3))
* **api:** properly filter fixtures by gameweek ([c4b498d](https://github.com/quantti/tapas-fpl-app/commit/c4b498d311f9a3c9e6c2ba26b17ef178e9fd7a13))
* **backend:** add pytest to requirements.txt for CI ([20b961a](https://github.com/quantti/tapas-fpl-app/commit/20b961a2cf4165dbecf627fe6a089ebd1ffda92c))
* **backend:** add respx to requirements.txt for HTTP mocking ([cc66629](https://github.com/quantti/tapas-fpl-app/commit/cc666294d57f421f1f8fc5f3618f8c322faa47e5))
* **chart:** resolve readonly array and type errors in tooltip ([fe8174d](https://github.com/quantti/tapas-fpl-app/commit/fe8174d9662f8fa8ff00e9b84cb9578872447723))
* **ci:** correct flyctl-actions repo name (flyctl-actions not flyctl-action) ([b07d0a8](https://github.com/quantti/tapas-fpl-app/commit/b07d0a8efb006f044d65adfc5ca1875fadf7aac3))
* **ci:** use Playwright Docker image for consistent E2E environment ([0850f1b](https://github.com/quantti/tapas-fpl-app/commit/0850f1b4468524f1f15dcd36410e00925667dd59))
* correct points display in manager lineup ([e0b5658](https://github.com/quantti/tapas-fpl-app/commit/e0b565844bd9edb2f6b2f610308a24834a7bff5f))
* fetch fixtures even when not live for countdown display ([d8ac0b9](https://github.com/quantti/tapas-fpl-app/commit/d8ac0b960f3fdb34837556956a33af155768f33f))
* filter fixtures by gameweek to show correct points ([c28dc2e](https://github.com/quantti/tapas-fpl-app/commit/c28dc2e8187f0d7d1a3e25f488ec0d83e6d8c9e9))
* **gameweek:** align Team Value and Captains row heights ([c0c6cd2](https://github.com/quantti/tapas-fpl-app/commit/c0c6cd2ae70f0633d3633be7f96ed3adf29827bc))
* **gameweek:** prevent captain name from truncating ([f72f5c4](https://github.com/quantti/tapas-fpl-app/commit/f72f5c49939f25eb463cf99a01efd9bced8ac06e))
* improve mobile table layout with fixed column widths ([9569387](https://github.com/quantti/tapas-fpl-app/commit/95693879be2410a54db0421cad43119a88745285))
* **live:** use finished_provisional for more accurate live indicator ([0f3d153](https://github.com/quantti/tapas-fpl-app/commit/0f3d1537558b5f41c0f8293eb44ce7256e5ac9bb))
* make favicon PNG backgrounds transparent ([bc495c6](https://github.com/quantti/tapas-fpl-app/commit/bc495c62a8a9a92f093a855a057eda3cd1750c3c))
* **mobile:** prevent horizontal scroll causing floating content ([62a7deb](https://github.com/quantti/tapas-fpl-app/commit/62a7deb7ba25a28ee4d099d22fc8385e2f1605ca))
* **modal:** fix header spacing and add CI workflow ([ca98432](https://github.com/quantti/tapas-fpl-app/commit/ca9843249819b5b553e04b3507685a6cb83c485e))
* **modal:** wrap ManagerModal content with root CSS class ([61cd3c2](https://github.com/quantti/tapas-fpl-app/commit/61cd3c252b73cdf974e9440d157c83e596e08ec9))
* normalize chip names to lowercase for comparison ([9e9f594](https://github.com/quantti/tapas-fpl-app/commit/9e9f5944925b5eb66c619db4f99cbaa552f38d42))
* restore original favicon PNGs ([6b61832](https://github.com/quantti/tapas-fpl-app/commit/6b618321d78539367651f56a912139207f04a655))
* revert to Tabler Icons football SVG ([56710c7](https://github.com/quantti/tapas-fpl-app/commit/56710c74463877c1ad25670ade5fcaa76be3ca92))
* show chips based on current gameweek (first half vs full season) ([e7db1dc](https://github.com/quantti/tapas-fpl-app/commit/e7db1dcea91ab16a5e8894319f11cdf48ffffb92))
* **standings:** update total score and sort table during live games ([79060d9](https://github.com/quantti/tapas-fpl-app/commit/79060d9f611da181029f6f35e43361ea3e2b951f))
* **stats:** align rows between Team Value and Captains cards ([aa086a7](https://github.com/quantti/tapas-fpl-app/commit/aa086a7d5fb90d58e100f3db8661c100d08af367))
* **table:** improve mobile responsive layout for league standings ([5b8a66b](https://github.com/quantti/tapas-fpl-app/commit/5b8a66b5ccba51b3cf13675f96cb37a9e7f564b6))
* **tests:** create varied ownership percentages in mock data ([40dbb24](https://github.com/quantti/tapas-fpl-app/commit/40dbb24c79f26075826064bd94081c9d9feba196))
* **tests:** resolve act() warnings and add CI detection ([a0a4d59](https://github.com/quantti/tapas-fpl-app/commit/a0a4d59340a864563e09bc3f82b39c4bc339ff4a))
* **test:** use CI-generated visual snapshots for cross-environment consistency ([3736014](https://github.com/quantti/tapas-fpl-app/commit/3736014436e681a29716cf8f5015d08fbe565675))
* **test:** use Ubuntu 22.04 (jammy) Docker image to match CI environment ([cd86554](https://github.com/quantti/tapas-fpl-app/commit/cd865548a7918d73df30464893e894119da132ba))
* **test:** use wildcard patterns for API mocking ([c385818](https://github.com/quantti/tapas-fpl-app/commit/c38581866aa056a0fab35a180791835adcd671af))
* **ui:** forward HTML attributes in Card component ([0df6495](https://github.com/quantti/tapas-fpl-app/commit/0df649510dd9d2509a2280d9adf05445b771e8ba))
* **ui:** position chevron between name and stats in list rows ([dbf212f](https://github.com/quantti/tapas-fpl-app/commit/dbf212ff0ac17aba5ebb992e2f0eb6c2859826d0))
* update worker URL and remove debug logs ([fb199c9](https://github.com/quantti/tapas-fpl-app/commit/fb199c9a03b43842d1cdd651e7a2f22b8688b058))
* use classic soccer ball pattern for favicon ([a84554d](https://github.com/quantti/tapas-fpl-app/commit/a84554d0f46357c6c59f083a9a0ae10807c8810f))
* use Europe/Madrid timezone for date/time display ([fccfa5c](https://github.com/quantti/tapas-fpl-app/commit/fccfa5c561516ca125fbe23046218890e72e03ea))
* use favicon_io(2) favicon set ([0323c86](https://github.com/quantti/tapas-fpl-app/commit/0323c865745bcd9cbf69152a0b131712db5609de))
* use fixture.started instead of date comparison ([73a28a0](https://github.com/quantti/tapas-fpl-app/commit/73a28a0ede2dff2d397eb68cb7617c7dc47cefaa))
* wrap provisional bonus in parentheses for clarity ([cb90e12](https://github.com/quantti/tapas-fpl-app/commit/cb90e124dbdd89a95c4a4e5948c61cddfbc31593))


### Features

* adaptive favicons with prefers-color-scheme media queries ([8fb5e56](https://github.com/quantti/tapas-fpl-app/commit/8fb5e569ae0ebf8f00ebed4756aa9ce605a0d3a9))
* adaptive SVG favicon with classic soccer ball design ([e8aaef4](https://github.com/quantti/tapas-fpl-app/commit/e8aaef48cb0636124c5cf1d8afd6a7247ac3f87c))
* add bench points and captain differential tracking ([13388ff](https://github.com/quantti/tapas-fpl-app/commit/13388ff9454b11974eadd1fdad7e177c88d04e00))
* add chips remaining section ([7e54b69](https://github.com/quantti/tapas-fpl-app/commit/7e54b69111cf092b10c386819b613f9a93537c28))
* add countdown timer to next gameweek deadline ([1e6ebff](https://github.com/quantti/tapas-fpl-app/commit/1e6ebfff0cfd08131047b7edcef62aecf2e31e21))
* add dark theme with system preference detection ([0c1418a](https://github.com/quantti/tapas-fpl-app/commit/0c1418aa2cd996a1bd52f0003b95977fd10e25c9))
* add football favicon ([3bff129](https://github.com/quantti/tapas-fpl-app/commit/3bff1297233899cd8c5ff23294049041229c1ba9))
* add League Template Team card with pitch formation view ([19d7d8c](https://github.com/quantti/tapas-fpl-app/commit/19d7d8ca1066ee6135a0178712e6e0af4284da84))
* add light/dark mode favicons with media queries ([9a68a8e](https://github.com/quantti/tapas-fpl-app/commit/9a68a8e5d9a3a16f5890c70e88a384f94818c9bb))
* add manager lineup page with pitch formation view ([cb759aa](https://github.com/quantti/tapas-fpl-app/commit/cb759aad15f5e8229f524769ddae164d75052b3e))
* add player ownership view ([0f837d0](https://github.com/quantti/tapas-fpl-app/commit/0f837d05bcb2d2c7d74164a753c4ae2fa12422b7))
* add purple rounded background to favicon ([04fd43d](https://github.com/quantti/tapas-fpl-app/commit/04fd43d8344b26052454cb78bc841bce1b43e813))
* add scaling optimizations and layout improvements ([4a3e500](https://github.com/quantti/tapas-fpl-app/commit/4a3e500b937b814cc8e0496a8f02f4a8ec22f581))
* add semantic-release for automated versioning ([c74fe25](https://github.com/quantti/tapas-fpl-app/commit/c74fe25d9326bdf192df2883c7563ea8e539c00a))
* **analytics:** add recommended players feature ([8406dda](https://github.com/quantti/tapas-fpl-app/commit/8406dda6a49dfbf33c2cb400153f99372a2c6224))
* **analytics:** add Time to Sell section for underperforming players ([786809c](https://github.com/quantti/tapas-fpl-app/commit/786809c98729803dd32992309b5287e1d00331c8))
* **backend:** add Python/FastAPI backend with FPL API proxy ([0e59c03](https://github.com/quantti/tapas-fpl-app/commit/0e59c0363d43deefd9de3956cc738222e26f624e))
* **dashboard:** add league position history chart ([4ca4a3f](https://github.com/quantti/tapas-fpl-app/commit/4ca4a3fcec8daeff9a01fde4006038c8d31d3759))
* **modal:** add manager lineup modal with team shirts ([f32e0db](https://github.com/quantti/tapas-fpl-app/commit/f32e0db6674470cc25fbb8f2431c4e04cc660770))
* **PlayerOwnership:** add modal showing team owners on click ([df8d149](https://github.com/quantti/tapas-fpl-app/commit/df8d1494d6e17ff155967f0c8f580e51c451a260))
* **recommendations:** increase punts to 20 players for more variety ([ca12b7b](https://github.com/quantti/tapas-fpl-app/commit/ca12b7bc2f464ff3b9a7dbc22ac72b0bfd5f0baf))
* replace emojis with Lucide React icons ([077585f](https://github.com/quantti/tapas-fpl-app/commit/077585f76f661eb8f68d8cee0c7c2a67549d5184))
* replace favicon with proper soccer ball icon set ([ff3e8f5](https://github.com/quantti/tapas-fpl-app/commit/ff3e8f54392c9958b6742fd1496b12e5bfb6d42d))
* restore Cloudflare Workers for FPL API proxy ([dbe8b00](https://github.com/quantti/tapas-fpl-app/commit/dbe8b00336e69c9299aa1464287b538007dd851e))
* **test:** add Docker-based E2E testing for consistent snapshots ([1da8827](https://github.com/quantti/tapas-fpl-app/commit/1da88274a09c26a8919d99d5e907263720af3a47))
* **ui:** add barrel export and ARIA role support for Card ([8e160a7](https://github.com/quantti/tapas-fpl-app/commit/8e160a752ff3b8eb8c04bcb9c0609777d12ffc74))
* **ui:** add Card, CardHeader, RankedRow, ListRowButton primitives ([b54d800](https://github.com/quantti/tapas-fpl-app/commit/b54d8008c9aae73e5c046631ab812012c0b67317))
* **ui:** replace position dots with text badges (DEF/MID/FWD) ([266311f](https://github.com/quantti/tapas-fpl-app/commit/266311fc5e3db6f17ca330e5a07d107f19c0219c))
* use adaptive SVG favicon with embedded dark mode CSS ([7ab8b44](https://github.com/quantti/tapas-fpl-app/commit/7ab8b44ed9efe179943ecf685c4104a388219b57))
* use white outline football icon with transparent background ([ddf73c8](https://github.com/quantti/tapas-fpl-app/commit/ddf73c871fae2a388910704caefb4ee626906c0d))
