# OSS Taxonomy integration

Stars Manager uses the complete `combined-taxonomy.json` vocabulary from
[ecosyste-ms/oss-taxonomy](https://github.com/ecosyste-ms/oss-taxonomy).

## Bundled snapshot

- Taxonomy version: `0.1.0`
- Generated at: `2026-08-20T07:56:22Z`
- Upstream commit: `8d11fff9aa4d9bd3b846f6569ba72713dfe93b71`
- Local data: `src/data/oss-taxonomy.json`
- License: CC0 1.0 Universal

The snapshot is bundled with the frontend so classification does not depend on
a runtime request to GitHub. The application consumes all six upstream facets:
Domain, Role, Technology, Audience, Layer, and Function.

## Matching behavior

Each upstream term becomes one built-in category. Its canonical name, aliases,
and tags are used as matching signals. Related terms and example projects are
kept in the snapshot for reference but are intentionally excluded from direct
matching because they cross facets or identify individual projects.

AI analysis is instructed to return three to five exact taxonomy terms. Manual
locked assignments and explicit empty assignments continue to take precedence.
Short ASCII terms use word-boundary matching so terms such as `ai`, `c`, and
`go` do not match unrelated words by substring.

## Updating the snapshot

1. Fetch the desired upstream revision.
2. Replace `src/data/oss-taxonomy.json` with upstream `combined-taxonomy.json`.
3. Update the version, timestamp, and commit recorded above and in
   `src/constants/ossTaxonomy.ts`.
4. Run the taxonomy tests, type checks, and production build.
