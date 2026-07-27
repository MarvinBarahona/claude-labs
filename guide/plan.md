# Paper Plan: Building AI-Powered Web App Features With the Claude API

## Summary

Create a repo-independent practitioner guide for senior software engineers on how to use the Claude API inside a web application. This repo is a playground and reference implementation for patterns, screenshots, and engineering lessons, not a template whose every feature belongs in a real product. The paper will generalize the architecture, API usage, feature patterns, testing strategy, and production concerns without copying repo-specific code, names, routes, or decisions. Playground-only affordances such as the inspector panel and fake mode may appear as optional testing or debugging ideas, never as user-facing product requirements.

The story flow: start from a conventional web app architecture, introduce a backend Claude API integration, then progressively build richer AI features: messages, streaming, structured output, tools, workflows, files, citations, code execution, web search, MCP, vision, extended thinking, and agents.

## Publication Deliverable

- Write the finished guide as `guide/claude-api-web-app-guide.md`.
- Treat that file as the canonical publication source and keep it self-contained so it can be read directly in a Markdown viewer or converted to PDF without requiring this repository, its application, or its internal documentation.
- Use repository examples only as evidence and inspiration. Reproduce all context needed to understand an example inside the guide, using portable snippets, diagrams, and explanations rather than links to local source files.
- Keep images and other publication assets under `guide/assets/` and reference them with relative paths that work in both Markdown rendering and the PDF toolchain.
- Screenshots will be captured from the application manually. While drafting, leave a searchable `SCREENSHOT TODO` placeholder at the exact insertion point instead of inventing, embedding, or automatically generating an application screenshot.
- Every screenshot placeholder must specify:
  - the application page, feature, and state to capture
  - any setup data or interaction required to reach that state
  - the UI region that should be visible and anything sensitive or irrelevant to exclude
  - the proposed filename under `guide/assets/`
  - draft alt text and caption
  - the transferable idea the screenshot supports
- Keep a screenshot checklist in the guide's drafting notes or as Markdown comments near the placeholders so the captures can be produced and inserted in one manual pass.
- Add PDF-specific build metadata or scripts separately if needed; do not clutter the guide with tool-specific conversion instructions.
- A generic root-level `publish.md` is intentionally avoided because the descriptive path makes the document's purpose clear and leaves room for other publications.

## Complete Document Framework

The publication should wrap the technical chapters below in enough front matter, navigation, synthesis, and reference material to work as a standalone guide.

1. [ ] **Title Page**
   - Title, subtitle, intended audience, author/organization placeholder, version, and publication date.
2. [ ] **Abstract**
   - A concise description of the guide's problem, scope, and practical outcome.
3. [ ] **Table Of Contents**
   - Linked Markdown contents with stable, PDF-friendly headings.
4. [ ] **Introduction**
   - Audience and assumed experience.
   - What readers will learn.
   - What the guide does and does not cover.
   - How the playground informed the guide without defining the product architecture.
5. [ ] **How To Use This Guide**
   - Suggested reading paths for architecture, implementation, testing, and feature research.
   - Conventions used for code, warnings, tradeoffs, and optional ideas.
6. [ ] **Glossary**
   - Define Claude/API terminology and overloaded application terms at first-use depth.
   - Include terms such as message, content block, tool use, tool result, hosted tool, custom tool, MCP, structured output, prompt caching, streaming event, workflow, and agent.
7. [ ] **Core Guide**
   - The architecture and feature chapters in the Structure section below.
   - Each chapter should state the problem, decision criteria, implementation pattern, tradeoffs, failure modes, testing approach, and production considerations.
8. [ ] **Putting It Together**
   - Show how the patterns compose into a representative feature from request through UI, orchestration, tools/data, response, and telemetry.
   - Include a decision guide for choosing messages, structured output, tools, fixed workflows, or agents.
9. [ ] **Production Readiness Checklist**
   - Security boundaries, data handling, model configuration, limits, resilience, observability, evaluation, accessibility, cost, latency, and rollout.
10. [ ] **Conclusion**
    - Summarize durable principles and identify sensible next experiments.
11. [ ] **References And Further Reading**
    - Prefer authoritative sources and annotate why each reference is useful.
    - Record access dates for web references where appropriate.
12. [ ] **Appendices**
    - Portable request/response examples.
    - Error taxonomy.
    - Testing matrix.
    - Model/tool capability comparison where it adds lasting value.
13. [ ] **Topical Index**
    - Add an alphabetical index of important concepts with links to their primary sections; keep this distinct from the table of contents.

## Structure

### 1. Why AI Features Need Product Architecture

- AI-powered features are not just prompts; they are user workflows backed by model calls, state, tools, data sources, error handling, and observability.
- Assume the standard server-side integration boundary: application credentials and privileged model/tool orchestration remain on the backend. State this briefly rather than teaching basic API-key security.
- Focus on the less obvious architectural decisions: where orchestration state lives, how model behavior maps to product workflows, how tool calls are controlled, and how failures and partial results cross system boundaries.
- The frontend owns interaction design, progressive disclosure, streaming display, and actionable user-visible errors.

### 2. Reference Web App Architecture

Cover the generalized architecture:

- Frontend calls only the application backend.
- Backend wraps the Claude API behind a typed client adapter.
- Application contracts expose only the response data and operational metadata that the product actually needs, such as usage, stop reasons, streaming events, citations, and multi-call workflow state.
- External data sources sit behind mockable backend clients.
- Observability belongs in backend telemetry and development tooling rather than in the end-user experience.
- When useful, mention fakes, fixtures, trace views, or a development-only inspector as ways to test and debug model interactions. Present these as optional playground techniques, not reference-architecture components.

Portable examples:

- `ClaudeClient` interface.
- `TurnEnvelope`.
- `ExternalApiError`.
- Streaming event contract.

### 3. Foundations: Messages API In A Web App

Explain the baseline feature:

- Single-turn and multi-turn messages.
- System prompts.
- Model selection.
- Temperature and model-specific parameter constraints.
- Non-streaming request/response.
- Streaming over SSE or fetch-stream parsing.
- Terminal success/error events.

Code/knowledge to include:

- Backend endpoint shape.
- Message request builder.
- Streaming loop.
- Frontend stream parser.
- Error handling for mid-stream failures.

### 4. Structured Outputs

Explain how to turn Claude responses into typed application data:

- JSON schema / `output_config`.
- When structured output is better than free text.
- Parsing and validating the returned text.
- Handling malformed or missing text blocks.
- Rendering structured results in the UI.

Code/knowledge to include:

- Portable schema example.
- Typed parsed response.
- Failure path when response cannot be parsed.
- Tests for schema presence and parsed shape.

### 5. Custom Backend Tools

Explain backend-executed tool use:

- Defining tools with names, descriptions, and input schemas.
- Claude returns `tool_use`.
- Backend executes real application logic.
- Backend sends `tool_result`.
- Loop continues until Claude returns a final answer.
- Recoverable tool failures should be returned as `is_error: true`, not transport failures.
- Preserve every call in the trace.

Code/knowledge to include:

- Tool definition snippet.
- Immutable tool loop pseudocode.
- Multi-call envelope with `calls`.
- Streaming tool activity events.
- Testing successful tools, bad tool arguments, and external failures.

### 6. Workflows Before Agents

Explain production-friendly workflow patterns:

- Routing.
- Chaining.
- Parallelization.
- Evaluator-optimizer loops.
- Retry caps.
- Why fixed workflows are easier to test, observe, and control than open-ended agents.

Code/knowledge to include:

- Pipeline orchestration pseudocode.
- Parallel grading/evaluation example.
- Retry feedback loop.
- Call trace structure.
- Token/cache considerations.

### 7. Files, Documents, Citations, And Caching

Explain document-heavy features:

- Attaching PDFs or large documents.
- Files API vs inline base64.
- Citations and source-grounded answers.
- Backend session state for uploaded file IDs and message history.
- Prompt caching for repeated document/context prefixes.
- Stripping or reshaping response metadata before resending it in later turns.

Code/knowledge to include:

- Content block builder abstraction.
- Session map shape.
- Citation flattening.
- Cache boundary placement.
- Tests for first ask vs follow-up ask.

### 8. Code Execution And Generated Artifacts

Explain sandboxed code execution:

- Uploading structured data through Files API.
- Enabling Claude's code execution tool.
- Reading executed commands and stdout/stderr.
- Downloading generated files.
- Optional custom skills for reusable capabilities.
- Why the sandbox needs explicit file upload rather than network access.

Code/knowledge to include:

- Dataset upload flow.
- Code execution request shape.
- Output file extraction.
- Skill registration/attachment concept.
- UI rendering for generated charts/spreadsheets/downloads.

### 9. Web Search And MCP Connectors

Explain server-executed tools:

- Web search as a hosted/server-executed tool.
- MCP connector as a way to expose external knowledge/tools.
- Difference between server-executed tools and backend-executed custom tools.
- Counting and displaying search/MCP activity.
- Combining tools with structured output.

Code/knowledge to include:

- Request with web search plus MCP tool fragment.
- Structured brief schema.
- Response parsing and tool-use counters.
- Failure behavior: MCP/tool failures may appear inside response blocks, not as HTTP failures.

### 10. Vision Features

Explain image inputs:

- Image content blocks.
- Multiple image comparison.
- Files API vs base64 delivery.
- Image count and dimension-limit considerations.
- UI patterns for showing source thumbnails plus model answer.

Code/knowledge to include:

- Image fetch and block construction.
- Multi-image request shape.
- Dimension-cap detection as application-side metadata.
- Streaming and non-streaming result handling.

### 11. Extended Thinking

Explain reasoning-focused features:

- Adaptive thinking.
- Effort levels.
- Summarized reasoning traces.
- Comparing latency, usage, and answer quality.
- Cases where thinking should be omitted, summarized, or compared.

Code/knowledge to include:

- Three-run comparison pattern.
- Extracting thinking blocks.
- Holding model constant while varying thinking settings.
- UI comparison table.

### 12. Agents As A Deliberate Exception

Explain agentic loops:

- Give Claude a goal and abstract tools.
- Let Claude choose steps.
- Keep tools small, composable, and observable.
- Add iteration caps.
- Surface tool activity and environment-inspection behavior.
- Contrast agents with fixed workflows.

Code/knowledge to include:

- Capped agent loop.
- Tool activity log.
- Mixed custom tools and server-executed tools.
- Final-answer extraction.
- Testing cap behavior and recoverable tool failures.

### 13. Testing And Operational Hardening

Cover engineering rigor:

- Unit tests with fake Claude/data clients.
- Backend integration tests with HTTP interception.
- Frontend tests for request shaping, rendering, streaming, and errors.
- Browser E2E against deterministic test doubles or recorded fixtures where appropriate.
- No real API keys in automated tests.
- Optional fake/demo mode for playgrounds, clickable examples, and local debugging; do not present it as an application feature or production requirement.
- Error taxonomy:
  - validation error
  - Claude API failure
  - external data-source failure
  - recoverable tool failure
  - mid-stream failure
- Verification checklist for every AI feature.

## Progress Tracking And Plan Maintenance

- Treat this plan as the acceptance checklist for the finished guide.
- Mark every writing session complete by changing its checkbox from `[ ]` to `[x]` only after all of that session's outputs and checks are complete.
- Mark any step that has been completed, and update any instruction in this plan that changes while writing the paper.
- When an instruction changes, revise the relevant plan text rather than relying on a separate note; preserve a short explanation in a `Plan Change Log` section when the change materially affects scope, structure, or acceptance criteria.
- Keep incomplete, deferred, or removed work visible and explain its disposition so final validation does not depend on memory.
- Do not mark the guide complete while unresolved `SCREENSHOT TODO` placeholders, broken references, unverified technical claims, or unchecked sessions remain.

### Plan Change Log

- Add dated entries here when the plan changes during drafting.
- 2026-07-27: Moved the plan to `guide/plan.md`, established `guide/` as the publication workspace, and added progress-tracking requirements.

## Writing Sessions

1. [x] **Architecture And Narrative**
   - Initialize `guide/claude-api-web-app-guide.md` with the complete heading structure and publication metadata before drafting chapters.
   - Define audience, thesis, terminology, and app architecture.
   - Output: intro plus architecture chapter.
2. [x] **Core Claude API Features**
   - Messages, streaming, structured output.
   - Output: chapters 3-4 with portable snippets.
3. [x] **Tools And Workflows**
   - Custom tools, tool loops, routing/chaining/parallelization/evaluator-optimizer.
   - Output: chapters 5-6.
4. [ ] **Rich Inputs And Hosted Capabilities**
   - Files, documents, citations, caching, code execution, skills, web search, MCP, vision.
   - Output: chapters 7-10.
5. [ ] **Advanced Reasoning And Agents**
   - Extended thinking and agentic loops.
   - Output: chapters 11-12.
6. [ ] **Testing And Hardening**
   - Test strategy, deterministic model substitutes, error handling, operational checklist.
   - Output: chapter 13.
7. [ ] **Self-Contained Assembly**
   - Assemble and reconcile all completed chapters in `guide/claude-api-web-app-guide.md` against the document framework.
   - Add the title page, abstract, table of contents, introduction, reading paths, glossary, synthesis chapter, conclusion, references, appendices, and topical index.
   - Replace dependencies on repo knowledge with inline context, portable examples, or publication assets.
8. [ ] **Editorial Pass**
   - Remove repo-specific names and paths except where the playground is explicitly identified as an optional case study.
   - Generalize snippets and define every non-obvious term before relying on it.
   - Check chapter transitions, cross-links, heading hierarchy, terminology, and reading order.
   - Align tone for senior engineers and remove extended explanations of foundational web-security or application-development facts.
   - Select screenshots only when they teach a transferable idea.
   - Add a `SCREENSHOT TODO` at each intended image location with capture state, framing, filename, alt text, caption, and teaching purpose for the user to fulfill manually.
   - After screenshots are supplied, insert them with relative `guide/assets/` paths and retain accessible alt text and useful captions.
9. [ ] **Technical And Publication Review**
   - Validate all code and request/response examples against the cited API documentation.
   - Verify that claims, limits, and model-specific behavior are cited and dated where they may change.
   - Test all internal links, table-of-contents links, references, and image paths.
   - Before final publication, search for `SCREENSHOT TODO` and either replace every placeholder with the manually supplied image or deliberately remove the planned figure and any prose that depends on it.
   - Render the Markdown to PDF and inspect page breaks, code wrapping, tables, callouts, image resolution, and index usability.
   - Have a senior engineer perform a cold read without using the repo, then resolve every point that depends on missing context.

## Assumptions

- The paper is about Claude API usage inside web applications, not Claude Code/CLI.
- The repo is a reference implementation only.
- Code examples should be portable TypeScript/pseudocode and JSON snippets.
- The canonical output is one self-contained Markdown document at `guide/claude-api-web-app-guide.md`, with publication assets under `guide/assets/`.
- The Markdown should use a single H1, ordered heading levels, fenced code blocks with language identifiers, relative asset links, accessible alt text, and tables narrow enough to render legibly in PDF.
- During drafting, screenshot placeholders should use a consistent, searchable Markdown-comment convention such as:

  ```markdown
  <!-- SCREENSHOT TODO
  Capture: [page/feature and exact UI state]
  Setup: [data and interactions required]
  Frame: [what to include and exclude]
  File: guide/assets/[descriptive-name].png
  Alt: [draft accessible alternative text]
  Caption: [draft figure caption]
  Purpose: [transferable concept illustrated]
  -->
  ```
- The PDF converter and page styling are implementation choices; the source document should remain useful without them.
- The audience wants practical architecture, implementation patterns, tradeoffs, and improvement paths.
