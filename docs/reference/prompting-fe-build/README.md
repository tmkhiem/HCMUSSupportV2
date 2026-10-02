# Reference snapshot: desired UI build (read-only)

This is a copy of the owner's half-built Tailwind prototype from `D:\git\SupportHcmusV2PromptingFEBuild` (which is not a
git repo), taken on 2026-10-02 so the desired look is available on every machine that clones this repository.

- **It is reference material only.** Nothing builds or lints it, and nothing imports it. Don't add a `node_modules` here.
- V2 rebuilds the **look** on MUI v9 (PLAN §7). It does **not** copy the code, Tailwind, Icons8 assets, the generic
  `BaseHeaderCard`/`BaseViewerCard` category renderer, or the backend-rendered Markdown.
- All data in `src/services/mock/` is synthetic.
- Useful files:
  - `styles.css` (acrylic, shadows, animations)
  - `src/theme.ts`
  - `src/App.tsx`
  - `src/components/*`
  - `src/pages/LoginPage.tsx`
  - `src/tabs/*` (NewsTab, ProfileTab, ResearchTab, AdminTab)
  - `src/tabs/features/*`
