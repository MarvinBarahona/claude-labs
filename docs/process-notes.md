# Process Notes

Append-only log of suggestions the drafting/build process can't apply itself: coding-convention/process changes, and changes to files it doesn't own (`README.md`, `CLAUDE.md`, other skills). Written during planning or graduation, never applied automatically. Reviewed and cleared manually, on your own schedule.

- `web-repo-research-reporter`: DTO-validation test scenarios written into a plan under an "Automated — Unit" heading (range/integer checks on a request field) may actually only be testable through the integration e2e-spec, since validation only runs through Nest's global `ValidationPipe`, not in a bare service-level unit test. Worth a `plan-work-item`/`writing-docs` convention note that this class of scenario should default to citing the integration-test bucket instead of "Unit," to match how it's actually implemented in practice (Structured Output Console and this feature both landed it there).

