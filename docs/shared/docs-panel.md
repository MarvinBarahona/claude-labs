# Docs Panel

The shared component that renders a lab's in-app Markdown doc (`frontend/public/lab-docs/<slug>.md`, per `repo-layout.md`) inline next to its demo, so the app is its own documentation instead of a separate docs site. It renders whatever Markdown sits at that path — it has no opinion on how that file got written or kept current (that's `write-lab-doc`'s job, run directly against a lab's code).

## Interface

`DocsPanel` (`frontend/src/app/shared/docs-panel/docs-panel.ts`, selector `app-docs-panel`) takes a single `slug` input — `input.required<string>()`. It derives the fetch path itself as `/lab-docs/${slug}.md`; a caller only ever passes a slug, never a path.

- Rendering: the fetched Markdown is parsed with the `marked` library and bound via Angular's `[innerHTML]`, which sanitizes the resulting HTML automatically through Angular's built-in `DomSanitizer` — no separate sanitization step. Headings, lists, code blocks (including fenced/language-tagged blocks), and links all render as formatted markup.
- Three states: a loading placeholder while the fetch is in flight; the rendered Markdown on success; a visible error message (not a blank panel) if the fetch fails, e.g. a missing doc file for that slug.
- The `slug` input can change after the component is mounted (e.g. a route param changing between features) — each change triggers a fresh fetch and re-render.

## Using it

Import `DocsPanel` and bind `[slug]` to the current feature's slug (e.g. from a route param or route data). No per-feature doc-rendering code is needed — the same component instance works for every feature, as long as `frontend/public/lab-docs/<slug>.md` exists for that slug.

## Testing

`frontend/src/app/shared/docs-panel/docs-panel.spec.ts` covers, using `HttpTestingController` to mock the fetch: rendering a fetched doc inline; headings/lists/fenced code blocks/links all rendering as formatted markup rather than raw Markdown text; and a visible error state (not a silent blank panel) when the doc fetch fails.
