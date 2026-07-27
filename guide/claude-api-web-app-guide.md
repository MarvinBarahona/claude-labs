# Building AI-Powered Web Application Features with the Claude API

**A practical architecture and implementation guide for senior software engineers**

Author or organization: _[To be supplied]_  
Version: 0.1 (working draft)  
Publication date: 2026-07-27

## Abstract

Adding Claude to a web application is not primarily a prompt-writing exercise. It is product and systems work: defining a useful interaction, placing a controlled model boundary on the server, designing application-owned contracts, managing state and tools, representing partial progress, and making probabilistic behavior testable and observable.

This guide develops those concerns from a conventional web architecture into progressively richer features. It begins with messages and streaming, then covers structured output, custom tools, fixed workflows, documents and citations, code execution, hosted tools, vision, extended thinking, and bounded agents. Each pattern is presented as an engineering choice with implementation guidance, tradeoffs, failure modes, tests, and production implications.

The examples use portable TypeScript and JSON rather than a particular framework. They are informed by a working playground, but the playground is evidence—not a template. The goal is to help you design the smallest dependable AI capability that fits your product.

## Table of Contents

1. [Introduction](#introduction)
2. [How to Use This Guide](#how-to-use-this-guide)
3. [Glossary](#glossary)
4. [Why AI Features Need Product Architecture](#1-why-ai-features-need-product-architecture)
5. [Reference Web Application Architecture](#2-reference-web-application-architecture)
6. [Foundations: Messages API in a Web Application](#3-foundations-messages-api-in-a-web-application)
7. [Structured Outputs](#4-structured-outputs)
8. [Custom Backend Tools](#5-custom-backend-tools)
9. [Workflows Before Agents](#6-workflows-before-agents)
10. [Files, Documents, Citations, and Caching](#7-files-documents-citations-and-caching)
11. [Code Execution and Generated Artifacts](#8-code-execution-and-generated-artifacts)
12. [Web Search and MCP Connectors](#9-web-search-and-mcp-connectors)
13. [Vision Features](#10-vision-features)
14. [Extended Thinking](#11-extended-thinking)
15. [Agents as a Deliberate Exception](#12-agents-as-a-deliberate-exception)
16. [Testing and Operational Hardening](#13-testing-and-operational-hardening)
17. [Putting It Together](#putting-it-together)
18. [Production Readiness Checklist](#production-readiness-checklist)
19. [Conclusion](#conclusion)
20. [References and Further Reading](#references-and-further-reading)
21. [Appendices](#appendices)
22. [Topical Index](#topical-index)

## Introduction

### Who this guide is for

This guide is for senior engineers and technical leads who already know how to build and operate a web application. It assumes familiarity with HTTP APIs, server-side credentials, typed application code, asynchronous work, automated tests, and production telemetry. It does not teach web fundamentals or attempt to catalog every Claude API field.

The central question is narrower and more useful: **how should an existing web application absorb model behavior without surrendering its product boundaries?**

### What you will learn

By the end of the guide, you should be able to:

- choose among free-text messages, structured output, tools, fixed workflows, and agents;
- place Claude behind a stable application-owned backend boundary;
- stream useful progress without coupling the browser to provider event details;
- preserve complete traces across multi-call turns;
- distinguish recoverable tool failures from failed requests;
- test model-integrated features without real API calls in automated suites; and
- evaluate a feature for security, resilience, latency, cost, accessibility, and rollout risk.

### Scope and non-goals

The guide covers Claude API integration inside a web product. It focuses on architecture, portable implementation patterns, failure behavior, and verification. It does not cover Claude Code or CLI usage, prompt-writing as a standalone discipline, framework-specific project setup, or a comprehensive review of web security.

Examples deliberately omit application-specific routes and names. They also separate production architecture from useful development affordances. A deterministic fake, raw trace viewer, or interactive inspector can dramatically improve engineering work, but none is automatically an end-user product requirement.

### How the reference playground informed this guide

The source playground implements many Claude capabilities as small, inspectable labs. That breadth exposes recurring concerns: every feature needs a server boundary, response contract, failure taxonomy, test double, and rendering strategy. It also reveals which ideas should not be copied wholesale. A showcase benefits from exposing raw payloads and letting users toggle implementation details; a production feature usually benefits from fewer controls and a workflow shaped around one user outcome.

Accordingly, this guide extracts patterns and counterexamples rather than presenting the playground as a starter application.

## How to Use This Guide

Read Chapters 1 and 2 first if you are establishing architecture or reviewing a design. Read Chapters 3 through 6 in order if you are implementing a first feature: messages lead naturally to typed results, tools, and then controlled multi-call workflows. Chapters 7 through 12 can be read independently when a product need requires a particular input or capability. Chapter 13 and the production checklist should accompany every implementation, not wait for a final hardening phase.

The examples use these conventions:

- **Application contract** means a type owned by your product, even when it contains selected Claude response metadata.
- **Provider type** means a request or response type supplied by the Anthropic SDK.
- TypeScript examples emphasize boundaries and control flow; adapt framework wiring to your stack.
- JSON examples omit irrelevant fields for readability.
- A warning identifies a failure mode with operational consequences. An optional pattern is useful in some products but not required by the reference architecture.

## Glossary

**Agent** — A model-directed loop in which Claude chooses the next action from available tools until it produces an answer or reaches an application-enforced limit.

**Content block** — A typed unit within a message, such as text, an image, a tool request, a tool result, or a thinking-related block.

**Custom tool** — An application-defined capability described to Claude with a name and input schema, then executed by your backend.

**Hosted tool** — A capability executed within Anthropic's infrastructure, such as supported web search or code execution.

**MCP** — Model Context Protocol, a protocol for exposing external tools and information sources to models through a standard interface.

**Message** — A role-bearing turn sent to or returned from the Messages API. A message contains one or more content blocks and operational metadata.

**Prompt caching** — A mechanism for reusing eligible, repeated prompt prefixes so later requests can reduce processing work.

**Streaming event** — An incremental event emitted while a response is being generated.

**Structured output** — Model output constrained by a JSON schema so application code can consume a typed result instead of extracting facts from prose.

**Tool result** — Content returned to Claude after a custom tool request is executed. It can represent success or a recoverable failure.

**Tool use** — A content block in which Claude requests invocation of a named tool with structured arguments.

**Turn** — One user-visible interaction. A turn may require one or many Claude API calls.

**Workflow** — An application-directed sequence of model calls and ordinary code, such as routing, chaining, parallelization, or evaluator-optimizer.

## 1. Why AI Features Need Product Architecture

### Begin with the user workflow, not the model call

A model call can produce text; a product feature must help a user complete a task. That task has inputs, permissions, intermediate states, completion criteria, and consequences. The most important design work happens before choosing a prompt:

1. Define the user decision or artifact the feature improves.
2. Decide what context the model may receive.
3. Decide which actions the model may propose or perform.
4. Define what the application validates independently.
5. Specify useful partial, empty, and failed states.
6. Choose how success will be evaluated after release.

This framing prevents a common architectural error: allowing the model's flexible output to become the application's implicit control plane. Claude can recommend, classify, extract, plan, and request tools, but the application should retain authority over access, validation, side effects, limits, and presentation.

### A turn is a distributed operation

Even a modest AI feature crosses several domains: the browser owns interaction state and rendering; the application backend owns credentials, policy, orchestration, and durable state; Claude produces probabilistic content and tool requests; external systems provide data or perform actions; and telemetry records what occurred without leaking sensitive content.

Treat a user-visible turn as a distributed operation rather than a function that maps a prompt to a string. It may stream for seconds, call dependencies, partially succeed, or fail after response bytes have already reached the browser. Its contract must therefore describe progress and termination as carefully as final content.

### Separate five kinds of state

| State | Typical owner | Examples |
|---|---|---|
| Interaction state | Frontend | draft input, selected files, expanded citations |
| Conversation state | Backend or durable store | accepted message history, uploaded file identifiers |
| Orchestration state | Backend | current workflow step, tool iteration count, retry budget |
| Provider state | Claude API | response identifier, stop reason, usage, content blocks |
| Observability state | Telemetry system | latency, trace correlation, redacted error details |

Do not make the browser the authority for privileged conversation or orchestration state merely because it renders the transcript. Likewise, do not resend an entire provider response automatically: retain only the blocks and metadata required for the next valid request.

### Choose the least autonomous fitting pattern

| Need | Prefer | Why |
|---|---|---|
| Explain, rewrite, summarize | One message | Minimal moving parts |
| Return fields consumed by code | Structured output | Explicit, validatable contract |
| Read or act through backend capabilities | Custom tools | Application controls execution |
| Perform a known multi-step process | Fixed workflow | Predictable order and bounded cost |
| Navigate an unknown sequence of steps | Bounded agent | Model can choose, within explicit limits |

An agent is not a more advanced default. It is a deliberate exception for tasks whose useful sequence cannot be known in advance. Most product flows are easier to test and operate as messages, tools, or fixed workflows.

### Design failure semantics before implementation

Not all failures mean the same thing:

- invalid user input should fail before a model call;
- a Claude API or network failure should fail the request;
- an external dependency failure may fail either the request or one recoverable tool attempt;
- invalid tool arguments should usually be returned to Claude as a failed tool result so it can correct them; and
- a failure after streaming begins must be represented inside the stream because the HTTP status has already been sent.

If these cases collapse into one generic error, users receive misleading feedback and orchestration code cannot make safe retry decisions.

### Production concerns shape the feature

Latency, token use, data retention, accessibility, and evaluation are not cleanup tasks. They affect the initial interaction. A long-running workflow needs visible progress and cancellation semantics. A citation feature needs a keyboard-accessible way to inspect sources. A tool with side effects needs idempotency or confirmation. A high-context feature needs budgets and cache-aware context construction.

The architectural goal is not to eliminate model uncertainty. It is to contain uncertainty inside a system whose permissions, contracts, and outcomes remain understandable.

## 2. Reference Web Application Architecture

### System boundary

The default architecture is intentionally conventional:

```text
Browser
  |
  | application HTTP/SSE contract
  v
Application backend
  |-- Claude client adapter ------> Claude API
  |-- external service clients ---> data sources and business systems
  |-- state store ----------------> sessions, jobs, uploaded-file metadata
  `-- telemetry ------------------> logs, metrics, traces, evaluations
```

The browser talks only to the application backend. The backend is the policy boundary: it resolves model configuration, builds requests, executes custom tools, controls loops, normalizes failures, and selects which operational metadata reaches the client.

This is more than credential hygiene. If a browser constructs provider requests directly, product policy becomes scattered across clients, provider changes leak into UI code, and privileged tool orchestration becomes difficult to secure.

### Put a narrow adapter around the SDK

Feature services should depend on an application-owned interface rather than instantiate the Anthropic SDK. Keep the adapter thin: it should preserve useful SDK types and behavior while centralizing configuration and error translation.

```ts
interface ClaudeClient {
  createMessage(request: ClaudeRequest): Promise<ClaudeMessage>;
  streamMessage(request: ClaudeRequest): AsyncIterable<ClaudeStreamEvent>;
  uploadFile?(file: Upload): Promise<{ id: string }>;
  downloadFile?(fileId: string): Promise<Download>;
}
```

Avoid building a speculative provider-neutral abstraction that erases content blocks, stop reasons, usage, caching, or tool behavior. Those semantics are useful. The goal is dependency control and testability, not pretending every model API is identical.

### Expose an application-owned turn envelope

The provider response and the UI contract solve different problems. A useful backend result contains the product output plus only the operational information consumers need.

```ts
interface CallTrace {
  request: ClaudeRequest;
  response: ClaudeMessage;
}

interface TurnEnvelope<T> {
  result: T;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  };
  stopReason: string | null;
  calls?: CallTrace[];
  warnings?: Array<{ code: string; message: string }>;
}
```

`calls` matters when one user turn causes multiple model calls. Preserve every call in order. A trace that retains only the final response hides routing decisions, failed tool attempts, and evaluator feedback—the exact details needed to debug cost and behavior.

Production APIs often should not return raw call traces to ordinary users. Send traces to telemetry, and expose them only in authorized development or support tooling.

### Never mutate a recorded request

Multi-call orchestration frequently appends messages between iterations. If trace entries reference one mutable request object, later changes silently rewrite earlier history.

```ts
const calls: CallTrace[] = [];
let current = initialRequest;

while (true) {
  const response = await claude.createMessage(current);
  calls.push({ request: current, response });

  const toolRequests = selectCustomToolRequests(response);
  if (toolRequests.length === 0) break;

  const toolResults = await executeTools(toolRequests);
  current = {
    ...current,
    messages: [
      ...current.messages,
      assistantTurn(response.content),
      userTurn(toolResults),
    ],
  };
}
```

The reassignment is not stylistic. It guarantees that each trace entry describes the request actually sent during that iteration.

### Keep external services behind mockable clients

A model-integrated feature often fails in a non-model dependency. Wrap each dependency behind a narrow client with an application error type.

```ts
class ExternalApiError extends Error {
  constructor(
    readonly source: "claude" | "search" | "repository",
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}
```

This type supports transport-level decisions but should not replace domain errors. An unknown document may be a recoverable tool result; an unavailable document service may need to fail the turn.

### Design streaming as an application protocol

For request bodies containing messages, settings, or attachments, a common browser transport is `fetch()` with a streamed response. Native `EventSource` is convenient for GET subscriptions but cannot send the POST body such turns usually require.

The application stream should represent model progress, application progress, and exactly one terminal outcome:

```ts
type AppStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_started"; name: string; callId: string }
  | { type: "tool_finished"; name: string; callId: string; ok: boolean }
  | { type: "turn_complete"; envelope: TurnEnvelope<unknown> }
  | { type: "turn_error"; error: PublicError };
```

A terminal completion event gives the frontend one place to obtain final usage, stop reason, citations, and reconciled content. A terminal error event is essential because a server cannot change the HTTP status after streaming has begun. Do not emit completion after a mid-stream failure.

### Separate custom tools from hosted tools

For a **custom tool**, Claude requests an action; the backend validates and executes it, sends a tool result in another message, and continues until a non-tool terminal response or a loop limit. For a **hosted tool**, Anthropic executes the capability and returns its activity within the provider response; the backend does not implement that tool's function.

A turn may mix both. The backend should loop only for tool requests it owns. Other content blocks must be retained and interpreted by type rather than treated as unknown text.

### Frontend responsibilities

The frontend owns interaction design, not orchestration policy. It validates cheap user-correctable constraints; shows queued, streaming, tool-active, completed, empty, and failed states; makes partial text visibly provisional; retains input when retry is appropriate; renders citations and artifacts accessibly; and offers cancellation when supported.

Do not expose every model setting because the API provides it. Model choice, token limits, temperature, thinking configuration, and tool availability are usually product configuration.

### Observability without accidental disclosure

Record enough to answer: what path ran, how long each step took, which model and configuration were used, how many tokens were consumed, which tools ran, how the turn ended, and which failure class occurred. Correlate all calls belonging to one user turn.

Prompts, tool arguments, documents, and outputs may contain sensitive data. Default to structured metadata and explicit redaction. Full payload capture should be opt-in, access-controlled, retention-limited, and compatible with the product's data policy.

### Architecture review checklist

- The browser calls only application-owned endpoints.
- Model and external-service credentials remain on the backend.
- Model and external clients are replaceable in tests.
- The application contract omits unused provider fields.
- Multi-call state and iteration limits live on the backend.
- Every stream has one explicit terminal outcome.
- Recoverable tool failures differ from transport failures.
- Traces preserve every call without mutation.
- Logs and traces have an explicit sensitive-data policy.

## 3. Foundations: Messages API in a Web Application

The Messages API is the foundation beneath the richer patterns in this guide. It accepts conversational turns and returns the next assistant message. The API is stateless: your application supplies the relevant history on every request. That fact determines where conversation state lives, how it is authorized, and how its size is controlled.

Anthropic's [Messages API reference](https://platform.claude.com/docs/en/api/messages/create) documents single-turn and stateless multi-turn requests. It also makes an easy-to-miss distinction: a system prompt belongs in the top-level `system` parameter, not in a message with a `system` role. (Accessed 2026-07-27.)

### Start with an application endpoint

Do not accept an arbitrary provider request from the browser. Define the choices your product supports and construct the Claude request on the backend.

```ts
interface SendTurnInput {
  conversationId: string;
  text: string;
  stream: boolean;
}

async function buildRequest(input: SendTurnInput): Promise<ClaudeRequest> {
  const history = await conversations.getAuthorizedHistory(
    input.conversationId,
    currentUser.id,
  );

  return {
    model: modelPolicy.forFeature("support-assistant"),
    max_tokens: 1_200,
    system: SUPPORT_SYSTEM_PROMPT,
    messages: [
      ...history,
      { role: "user", content: [{ type: "text", text: input.text }] },
    ],
  };
}
```

The endpoint owns authorization, model configuration, token budgets, and the system prompt. The browser supplies user intent and interaction preferences—not arbitrary model identifiers, system instructions, or tool definitions unless those are intentionally user-configurable product features.

### Treat history as server-validated state

For a prototype, the browser can send the visible transcript. In a product, prefer a conversation identifier and backend-owned history when messages affect permissions, billing, auditability, or later actions. A client-supplied transcript can be edited, omit prior instructions, or include content the current user is not entitled to submit.

Before every call:

- authorize access to the conversation;
- validate new content;
- select only history required for the turn;
- preserve content-block types needed by later tool or citation flows; and
- enforce context and cost budgets through truncation, summarization, retrieval, or a combination.

Do not flatten every assistant message to text if later turns need non-text blocks. Conversely, do not persist and resend all response metadata blindly. Store a deliberate conversational representation.

### Centralize model configuration

Model names and supported parameters change. Resolve a product-level choice such as `fast`, `balanced`, or `deep-analysis` through backend configuration rather than scattering identifiers across features.

```ts
const profile = modelProfiles.get("balanced");
const request: ClaudeRequest = {
  model: profile.model,
  max_tokens: profile.maxTokens,
  ...(profile.temperature === undefined
    ? {}
    : { temperature: profile.temperature }),
  system,
  messages,
};
```

Only send parameters supported by the selected model and feature combination. Omitting an unsupported or unnecessary field is safer than forwarding a generic settings object. Record the resolved configuration in telemetry so a later model migration can be evaluated.

### Implement the non-streaming path first

The blocking path establishes request construction, response parsing, usage mapping, and error translation with the fewest moving parts.

```ts
async function completeTurn(input: SendTurnInput): Promise<TurnEnvelope<string>> {
  const request = await buildRequest(input);
  const response = await claude.createMessage(request);
  const text = response.content
    .filter((block): block is TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  await conversations.appendCompletedTurn(input.conversationId, input.text, response);
  return buildEnvelope(text, request, response);
}
```

Never assume `content[0]` is text. Content is a typed block array, and later features introduce more block types. Decide whether multiple text blocks should be concatenated, rendered separately, or rejected for a particular contract. Inspect `stop_reason` before treating the result as complete; a token-limit stop is not a natural end.

### Add streaming for user-perceived progress

Streaming helps when users benefit from reading an answer as it arrives. It adds protocol and state complexity, so a short classification or extraction may be clearer as one atomic result.

Claude streams Messages responses as Server-Sent Events. The sequence begins with `message_start`, opens each indexed content block, emits deltas, closes the block, reports message deltas, and ends with `message_stop`. Streams may contain `ping`, error, and future event types, so consumers must tolerate events they do not use. See Anthropic's [streaming guide](https://platform.claude.com/docs/en/build-with-claude/streaming) (accessed 2026-07-27).

```ts
async function streamTurn(input: SendTurnInput, writer: EventWriter) {
  const request = await buildRequest(input);
  const accumulator = new MessageAccumulator();

  try {
    for await (const event of claude.streamMessage(request)) {
      accumulator.accept(event);
      if (event.type === "content_block_delta" &&
          event.delta.type === "text_delta") {
        writer.send({ type: "text_delta", text: event.delta.text });
      }
      // Ignore unknown events for rendering, but retain them in an authorized trace.
    }

    const response = accumulator.finalMessage();
    await conversations.appendCompletedTurn(input.conversationId, input.text, response);
    writer.send({
      type: "turn_complete",
      envelope: buildEnvelope(extractText(response), request, response),
    });
  } catch (error) {
    writer.send({ type: "turn_error", error: toPublicError(error) });
  }
}
```

The accumulator must reconstruct every supported content block and top-level delta, not only visible text. Official SDK accumulation helpers are a good choice when they fit the adapter. A public frontend contract should normally translate provider events into stable application events so it can also represent custom-tool activity and terminal outcomes.

### Parse browser streams incrementally

Network chunks do not align with SSE frames. One chunk can contain half an event or several events. Keep an unfinished buffer between reads, split only on complete frame delimiters, and parse `event:` and `data:` fields independently.

```ts
for await (const frame of decodeSseFrames(response.body)) {
  const event = parseAppEvent(frame);
  switch (event.type) {
    case "text_delta":
      provisionalText += event.text;
      renderProvisional(provisionalText);
      break;
    case "turn_complete":
      applyCanonicalResult(event.envelope);
      break;
    case "turn_error":
      showRecoverableError(event.error);
      break;
  }
}
```

Treat streamed text as provisional until `turn_complete`. The terminal envelope may include normalized content, citations, warnings, and final usage that cannot be known from deltas alone.

### Failure modes and resilience

Before streaming starts, failures can use non-2xx HTTP responses. After bytes have been sent, errors must travel through the stream. Anthropic can also emit an API error as an SSE event.

Account for browser cancellation, proxy buffering and idle timeouts, a connection ending without a terminal event, duplicate submissions, persistence failure after generation, and unknown future events. Use an idempotency or client-turn identifier when a retry could duplicate transcript entries or side effects. Do not retry a partially streamed generation invisibly: a second answer may differ.

### Testing the Messages foundation

Unit tests should prove request construction, top-level system-prompt placement, model resolution, history ordering, content-block extraction, stop-reason handling, and provider-error translation. Integration tests should intercept the SDK HTTP call and verify normal responses, API errors, and streamed reconstruction. Frontend tests should split frames across arbitrary chunks, combine frames, cover unknown events, and assert that only completion commits the canonical answer. Browser tests should exercise pending, streaming, completed, cancelled, and failed states against deterministic responses.

In production, measure time to first content, time to completion, cancellation rate, stop reasons, usage, and error class. These reveal different problems; total latency alone does not.

## 4. Structured Outputs

Free text is appropriate when a person will interpret the answer. When application code needs fields, enums, arrays, or nested records, use structured output. Prompting Claude to “return JSON” is not the same guarantee: malformed JSON, missing fields, and inconsistent types remain possible.

Claude's JSON outputs constrain the response with a schema supplied at `output_config.format`. This differs from strict tool use: JSON outputs constrain Claude's direct response, while `strict: true` constrains tool names and inputs. Anthropic documents both under [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) (accessed 2026-07-27).

### Choose structured output when code owns the next step

Good uses include extraction, classification, routing decisions, form suggestions, and machine-rendered reports. Prefer free text when structure would merely wrap one prose answer or encode an unstable product concept prematurely.

A schema is an application contract. Keep it small, version it deliberately, and name fields for domain meaning rather than UI placement. Do not make every property optional “for flexibility”; that pushes ambiguity into every consumer.

```ts
const triageSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    priority: { type: "string", enum: ["low", "normal", "urgent"] },
    actionItems: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["summary", "priority", "actionItems"],
  additionalProperties: false,
} as const;

interface TriageResult {
  summary: string;
  priority: "low" | "normal" | "urgent";
  actionItems: string[];
}
```

`additionalProperties: false` keeps the provider contract aligned with the application type. Consult current documentation before using advanced schema features because structured outputs support JSON Schema with documented limitations.

### Build, parse, and validate the request

```ts
async function triage(text: string): Promise<TurnEnvelope<TriageResult>> {
  const request: ClaudeRequest = {
    model: modelPolicy.forFeature("ticket-triage"),
    max_tokens: 800,
    system: "Extract ticket facts. Do not invent unsupported actions.",
    messages: [{ role: "user", content: text }],
    output_config: {
      format: {
        type: "json_schema",
        schema: triageSchema,
      },
    },
  };

  const response = await claude.createMessage(request);
  assertStructuredCompletion(response);
  const textBlock = response.content.find(
    (block): block is TextBlock => block.type === "text",
  );
  if (!textBlock) throw new InvalidModelResponse("Missing structured text block");

  const parsed: unknown = JSON.parse(textBlock.text);
  const result = validateTriageResult(parsed);
  return buildEnvelope(result, request, response);
}
```

Schema-constrained output strengthens the provider response, but runtime validation remains useful at your trust boundary. It protects against integration regressions, unsupported stop conditions, accidental calls without the schema, and later application changes. Generate the TypeScript type, schema, and validator from one source when your tooling supports it; otherwise test that they stay aligned.

Some SDKs provide parsing helpers that derive or accept a runtime schema. They reduce boilerplate, but keep their use behind `ClaudeClient` so features stay testable and provider setup remains centralized.

### Handle valid HTTP responses that are not valid results

Schema compliance does not override every termination condition. Anthropic documents two important exceptions:

- a safety refusal returns HTTP 200 with `stop_reason: "refusal"`, and its text may not match the requested schema;
- a response stopped at `max_tokens` may contain incomplete JSON.

Check the stop reason before parsing. Treat refusal as a product-level outcome with appropriate UI language, not a parser defect. Treat truncation as incomplete generation; retry only under an explicit cap and when a larger output budget is appropriate.

```ts
function assertStructuredCompletion(response: ClaudeMessage): void {
  if (response.stop_reason === "refusal") {
    throw new ModelRefusal(extractDisplayableText(response));
  }
  if (response.stop_reason === "max_tokens") {
    throw new IncompleteModelResponse("Structured result reached its token limit");
  }
}
```

Keep distinct internal failures for absent text, JSON parsing, and runtime validation. They may share a safe user message, but separate telemetry codes make configuration bugs visible.

### Render domain data, not JSON

The frontend should consume `TriageResult`, not parse the provider response. Render fields using ordinary components: a priority badge, summary region, and action list. Define empty states for valid empty arrays. Preserve the original input on failure and make retry behavior explicit.

Do not expose raw JSON as the primary interface unless the product is a developer tool. A structured-output feature succeeds when users see a stable domain object, not when they see that the model followed a schema.

### Decide deliberately whether to stream

Structured outputs can be streamed, but individual text deltas contain incomplete JSON. Do not repeatedly call `JSON.parse` on the growing string and treat parser errors as exceptional. Show a generating state and parse after completion, use an SDK-supported partial parser for a carefully designed progressive UI, or choose non-streaming when the result is small.

For most forms and classifications, an atomic result is simpler and avoids fields appearing with values that later change. Streaming is more useful for large structured reports where progressive sections materially improve the experience.

### Performance, caching, and compatibility

Anthropic compiles schemas into grammars. The first request for a schema can add latency, while compiled grammars are cached; changing schema structure or the tool set can invalidate that cache. Structured output also adds formatting instructions to the prompt and affects input tokens. Measure cold and warm behavior separately.

Do not place personal or sensitive values in property names, enums, constants, or patterns. Schemas are operational definitions and may be cached differently from message content. Put user data in messages, not dynamically generated schema labels.

Compatibility matters. At the time of writing, Anthropic documents JSON outputs as incompatible with citations and message prefilling. Recheck before combining capabilities, and keep volatile support claims close to authoritative references rather than encoding them as timeless architecture.

### Testing structured output

Unit tests should assert the exact schema, selected model, token budget, domain mapping, and distinct paths for refusal, truncation, missing text, malformed JSON, and validation failure. Although constrained decoding should prevent ordinary schema violations, negative tests protect the adapter and fakes.

Integration tests should intercept the real SDK request and verify the `output_config.format` wire shape. Frontend tests should render every enum and empty-list state, show safe errors, and never depend on raw provider blocks. Contract fixtures should include stop reason and usage so tests exercise the whole envelope.

In production, track schema version, cold/warm latency, stop reason, validation outcome, and retry count. Evaluate semantic correctness separately from structural validity: a perfectly valid `priority: "urgent"` can still be the wrong classification.

## 5. Custom Backend Tools

A custom tool lets Claude request a capability that your backend owns: look up an order, search an internal catalog, calculate a quote, or propose an update. Claude chooses a tool and supplies arguments; your application validates authorization and input, executes ordinary code, and returns the result. The model never receives direct access to your function, network, database, or credentials.

This boundary is the most important property of tool use. A `tool_use` block is a structured request, not permission to perform an action.

### Define narrow, legible tools

A tool definition needs a stable name, a precise description, and a JSON Schema for its input.

```ts
const tools = [
  {
    name: "lookup_order",
    description:
      "Retrieve shipment status for an order the current user is authorized to view.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          description: "Public order identifier, for example ORD-10482",
        },
      },
      required: ["orderId"],
      additionalProperties: false,
    },
  },
] as const;
```

Describe what the tool does, when it applies, and what each argument means. Avoid one broad `execute_action` tool with a large union of behaviors; small tools are easier to authorize, test, observe, and remove. Use `strict: true` when schema-valid arguments matter, while still applying domain validation in your code.

Tool names and schemas are not access control. Resolve the authenticated principal outside the model-generated arguments. For example, accept `orderId` from Claude but derive `customerId` from the server session. Never let the model choose a tenant, role, or unrestricted storage path merely because the field validates.

### Close the tool-use loop

When Claude calls a client tool, the response has `stop_reason: "tool_use"` and one or more `tool_use` blocks containing `id`, `name`, and `input`. Execute the recognized tools, then append two turns: the complete assistant response and one user message containing the matching `tool_result` blocks. Anthropic's [tool-call handling guide](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls) documents this lifecycle and message ordering (accessed 2026-07-27).

```ts
const MAX_TOOL_ROUNDS = 6;

async function runToolTurn(initial: ClaudeRequest): Promise<TurnEnvelope<string>> {
  let request = initial;
  const calls: CallTrace[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await claude.createMessage(request);
    calls.push({ request, response });

    if (response.stop_reason !== "tool_use") {
      return {
        ...buildEnvelope(extractText(response), request, response),
        calls,
      };
    }

    const requested = response.content.filter(isToolUseBlock);
    if (requested.length === 0) {
      throw new InvalidModelResponse("tool_use stop without a tool_use block");
    }

    const results = await executeToolBatch(requested);
    request = {
      ...request,
      messages: [
        ...request.messages,
        { role: "assistant", content: response.content },
        { role: "user", content: results },
      ],
    };
  }

  throw new ToolLoopLimitExceeded(MAX_TOOL_ROUNDS);
}
```

The request is reassigned rather than mutated so every trace entry remains an accurate snapshot. A production loop also needs caps on rounds, total tool calls, wall-clock time, and possibly spend. Reaching a cap is a controlled incomplete outcome, not permission to continue indefinitely.

Check every non-tool stop reason explicitly. `end_turn` can produce the final answer, while truncation, refusal, or other supported stop conditions need their own handling. A loop condition alone does not prove success.

### Validate and dispatch through a registry

Do not use dynamic property access or evaluate a tool name. Dispatch only through a closed registry whose entries combine validation, authorization, execution, and result shaping.

```ts
interface ToolContext {
  userId: string;
  requestId: string;
  signal: AbortSignal;
}

const toolRegistry: ToolRegistry = {
  lookup_order: {
    parse: parseLookupOrderInput,
    execute: async (input, context) => {
      const order = await orders.findAuthorized(input.orderId, context.userId);
      if (!order) throw new RecoverableToolError("Order was not found");
      return { status: order.status, estimatedDelivery: order.eta };
    },
  },
};
```

Reject unknown names, validate inputs at runtime, and apply timeouts. Minimize results before returning them to Claude: exclude secrets, internal identifiers, irrelevant records, and unrestricted error details. Tool outputs consume context and can disclose data just as surely as the original prompt.

Tool-returned text is untrusted. A web page, email, repository file, or database record may contain instructions designed to redirect the model. Keep such material inside `tool_result` content, label its provenance, restrict tool authority independently, and never promote retrieved text into the system prompt.

### Distinguish recoverable tool failures from failed turns

A bad model-supplied identifier, an unavailable item, or a domain rule rejection often belongs in a `tool_result` with `is_error: true`. Claude can revise its arguments or explain the limitation.

```ts
function failedToolResult(id: string, error: RecoverableToolError) {
  return {
    type: "tool_result" as const,
    tool_use_id: id,
    is_error: true,
    content: error.safeMessage,
  };
}
```

A credential failure, widespread dependency outage, corrupted configuration, or orchestration bug should generally fail the turn. Do not disguise infrastructure failures as successful tool content: doing so encourages Claude to reason from missing or misleading data.

The distinction should follow domain semantics, not one blanket `catch`. Maintain a small error taxonomy and expose only safe, actionable detail to the model. Record the original error in protected telemetry.

### Execute parallel calls only when safe

One assistant response can contain several `tool_use` blocks. Independent, read-only calls can run concurrently; writes, shared-state operations, or dependent calls may require sequential execution. Anthropic's [parallel tool-use guidance](https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use) leaves execution order to the application but requires one result for every request, grouped into the next user message and matched by `tool_use_id` (accessed 2026-07-27).

```ts
async function executeToolBatch(blocks: ToolUseBlock[]) {
  return Promise.all(blocks.map((block) => executeOneTool(block)));
}
```

If a sequential batch stops after an earlier failure, still return `is_error: true` results for calls you deliberately skipped. For side effects, add confirmation, idempotency keys, precondition checks, and audit records. Consider separating read tools from propose/commit operations so Claude can plan without silently executing a consequential change.

### Stream application activity, not invented model text

A tool loop can span several Claude calls and periods with no text deltas. Emit application events around backend execution so users see meaningful progress.

```ts
writer.send({ type: "tool_started", name: block.name, callId: block.id });
const result = await executeOneTool(block);
writer.send({
  type: "tool_finished",
  name: block.name,
  callId: block.id,
  ok: result.is_error !== true,
});
```

Expose a user-safe label rather than raw arguments when inputs may be sensitive. Preserve raw provider events and tool timing in authorized traces. The stream still ends with exactly one `turn_complete` or `turn_error` event representing the entire user-visible turn.

### Test and operate custom tools

Unit tests should cover tool definitions, registry dispatch, unknown names, argument validation, authorization, success, recoverable `is_error`, transport failure, multiple calls, immutable traces, stop-reason branches, and every cap. Verify that all results appear in one user message with the correct identifiers.

Integration tests should intercept both Claude and external-service traffic, proving the exact assistant/tool-result history across multiple rounds. Frontend tests should render ordered activity and terminal failure without exposing sensitive arguments. Browser tests should use deterministic trajectories: no-tool answer, one successful tool, parallel tools, self-correction after a failed result, and cap exhaustion.

In production, record tool name, duration, outcome class, round number, and correlation identifiers—not unrestricted arguments or results. Alert on rising error rates, repeated calls with the same arguments, cap exhaustion, and unexpected use of consequential tools.

## 6. Workflows Before Agents

A workflow is an application-directed sequence of model calls and ordinary code. The application decides which stages exist, what each stage receives, when work runs concurrently, and when the process stops. This predictability makes workflows the default for multi-step product features.

Anthropic's [Building Effective AI Agents](https://www.anthropic.com/engineering/building-effective-agents) distinguishes workflows, whose paths are predefined in code, from agents, whose process and tool use are dynamically directed by the model. Its practical recommendation is to begin with the simplest pattern that works and add complexity only when it demonstrably improves outcomes. (Accessed 2026-07-27.)

### Recognize the four reusable patterns

**Routing** classifies an input and selects a specialized path. It works when categories are stable enough to define and different categories benefit from different prompts, models, data, or policies.

**Chaining** feeds one stage into the next. It works when a task decomposes into ordered transformations, such as extract, draft, then refine. Each boundary creates an opportunity to validate or persist an intermediate artifact.

**Parallelization** runs independent work concurrently and aggregates it. It works for independent retrieval, several evaluation criteria, or multiple candidate solutions. It does not help when calls share a hidden dependency or when their combined rate exceeds service limits.

**Evaluator-optimizer** alternates generation and review until a quality threshold or cap is reached. It works when success criteria can be stated clearly and evaluator feedback can improve the next attempt.

These patterns compose. A support workflow might route a request once, draft and refine a response in sequence, grade tone and policy in parallel, and retry the drafting chain only when a grader fails.

### Model the workflow as typed stages

Keep stage inputs and outputs explicit. Do not pass one growing bag of strings and provider responses through the pipeline.

```ts
interface RoutedRequest {
  category: "billing" | "technical" | "account";
  request: SupportRequest;
}

interface DraftCandidate {
  text: string;
  attempt: number;
}

interface Grade {
  criterion: "accuracy" | "tone" | "policy";
  passed: boolean;
  feedback: string;
}

interface WorkflowResult {
  route: RoutedRequest["category"];
  answer: string;
  grades: Grade[];
  attempts: number;
  passed: boolean;
}
```

A workflow stage can use free text, structured output, tools, or ordinary deterministic code. Use structured output for routing and grading because downstream code owns those decisions. Use prose for a draft intended for a person. Use normal code for policy checks that do not need model judgment.

### Route once, then keep the decision stable

```ts
async function route(request: SupportRequest): Promise<RoutedRequest> {
  const result = await structuredMessage<RouteOutput>({
    profile: "fast-classifier",
    schema: routeSchema,
    system: ROUTER_PROMPT,
    input: request.text,
  });
  return { category: result.category, request };
}
```

Validate the route against a closed set and define a safe fallback for low-confidence or unknown cases. Avoid asking the router to produce both a category and a full response if only the category determines the next path; mixed responsibilities make evaluation harder.

Do not reroute unchanged input on every optimizer attempt. A stable route reduces cost and prevents the pipeline from oscillating between strategies. Reroute only when feedback or new data genuinely changes the classification problem.

### Chain stages with explicit handoffs

```ts
async function draftAndRefine(
  routed: RoutedRequest,
  feedback: string[],
  attempt: number,
): Promise<DraftCandidate> {
  const draft = await draftResponse(routed, feedback);
  validateDraftExists(draft);
  const refined = await refineResponse(routed, draft);
  return { text: refined, attempt };
}
```

Each stage should receive the minimum context needed and produce an inspectable artifact. Replaying the original context plus the draft is often clearer than asking a single conversation to remember implicit stage instructions. Persist an intermediate result when replay cost is high or recovery must resume after failure.

Chaining increases latency and can amplify an early error. Add validation at stage boundaries and decide whether a downstream stage may repair, reject, or merely decorate the previous result. More stages are not automatically more accurate.

### Parallelize independent evaluation

```ts
const criteria: Grade["criterion"][] = ["accuracy", "tone", "policy"];

async function grade(candidate: DraftCandidate): Promise<Grade[]> {
  return Promise.all(
    criteria.map((criterion) => gradeCriterion(candidate.text, criterion)),
  );
}
```

Parallel grading lowers wall-clock latency relative to three sequential calls and isolates prompts by criterion. It also raises instantaneous concurrency and may encounter rate limits. Apply a concurrency limiter when the number of branches is data-dependent, and define whether one grader failure fails the workflow or returns an incomplete evaluation.

Collect traces in deterministic logical order even when promises resolve in a different order. The easiest pattern is for each branch to return its result and call trace, then assemble them by criterion after `Promise.all`; avoid pushing into one shared array from concurrent callbacks if chronological ordering matters.

### Bound the evaluator-optimizer loop

```ts
const MAX_ATTEMPTS = 3;

async function runWorkflow(input: SupportRequest): Promise<WorkflowResult> {
  const routed = await route(input);
  let feedback: string[] = [];
  let latest!: DraftCandidate;
  let grades: Grade[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    latest = await draftAndRefine(routed, feedback, attempt);
    grades = await grade(latest);

    if (grades.every((item) => item.passed)) {
      return resultOf(routed, latest, grades, true);
    }

    feedback = grades
      .filter((item) => !item.passed)
      .map((item) => `${item.criterion}: ${item.feedback}`);
  }

  return resultOf(routed, latest, grades, false);
}
```

A cap is part of the product contract. The final result must say whether it passed, how many attempts ran, and what feedback remains. Do not label the last attempt successful merely because the loop ended.

Evaluator prompts need a specific rubric and structured response. Watch for evaluators that reward superficial keyword changes, disagree with human judgment, or approve their own preferred writing style rather than the product requirement. Calibrate against a human-reviewed set and track pass rates by criterion.

### Preserve one trace across the whole turn

A multi-stage workflow is still one user-visible turn. Give it one correlation identifier and record every call with a stage name, attempt, branch, request, response, usage, and duration.

```ts
interface WorkflowCall extends CallTrace {
  stage: "route" | "draft" | "refine" | "grade";
  attempt?: number;
  branch?: string;
  durationMs: number;
}
```

The product response can expose route, final artifact, grades, attempt count, and pass state without exposing raw prompts. Protected development tooling can show the complete trace. Report total usage as the sum across calls; showing only the final grader's tokens materially understates cost.

### Reuse stable prefixes deliberately

Workflows often repeat the same source document, policy, or case context across stages and attempts. Keep that shared prefix byte-stable and place variable stage instructions after it so prompt caching can apply where supported. Changing tool definitions, schemas, or earlier content can invalidate reuse, so measure cache reads rather than assuming them.

Caching reduces repeated input processing; it does not make unnecessary calls free. Routing once, limiting retries, choosing an appropriate model per stage, and running independent calls concurrently remain the larger architectural decisions.

### Decide how workflows fail and resume

Define failure semantics per stage:

- invalid input fails before routing;
- an unavailable required data source fails the workflow;
- one optional parallel branch may yield a partial result if the contract permits it;
- a transient model failure may retry under a small backoff budget;
- a failed evaluator is not the same as an evaluator returning `passed: false`; and
- cap exhaustion returns a completed-but-unapproved artifact, not a transport error.

For long workflows, consider a durable job model rather than holding one request open. Persist stage completion and idempotency keys so a worker can resume without repeating completed side effects. A short, bounded pipeline can remain synchronous when infrastructure timeouts and user expectations allow it.

### Test the graph, not only each prompt

Unit-test every stage with deterministic model results, then test orchestration trajectories: each route, first-pass success, one feedback retry, conflicting graders, branch failure, retry exhaustion, and call ordering. Assert exact call counts so an accidental extra model call cannot silently change cost and latency.

Integration tests should verify schemas, cache boundaries, model profiles, and external clients at the wire boundary. Frontend tests should render stage progress and clearly distinguish “completed and passed,” “completed at cap,” and “failed.” Browser tests need only a small set of deterministic representative trajectories.

In production, record latency and usage per stage and for the whole workflow, route distribution, attempts, criterion pass rates, cache behavior, and terminal status. Compare those metrics with user outcomes. A workflow that passes its model evaluator but produces low user acceptance needs a better rubric or design, not simply more retries.

### Workflow design checklist

Before choosing an agent, ask:

- Can the useful paths be enumerated?
- Can each stage have a typed input, output, and success condition?
- Can independent branches be identified safely?
- Can retries use actionable feedback and a hard cap?
- Can a human understand the full call trace?

If the answers are mostly yes, a workflow will usually be more dependable than an open-ended agent.

## 7. Files, Documents, Citations, and Caching

Document features combine several concerns that are easy to conflate: moving bytes to Claude, representing a document in a message, grounding claims with citations, retaining conversation state, and avoiding repeated processing. Design each concern explicitly.

### Choose a delivery method independently of document semantics

A supported document can be included inline or uploaded once and referenced by `file_id`. Both approaches ultimately produce a document content block; the difference is how its source reaches the API.

```ts
type DocumentSource =
  | { type: "base64"; media_type: "application/pdf"; data: string }
  | { type: "file"; file_id: string };

function documentBlock(source: DocumentSource, title: string) {
  return {
    type: "document" as const,
    source,
    title,
    citations: { enabled: true },
  };
}
```

Inline base64 is simple for a one-off, modest file and works without separately managed file lifecycle. It enlarges every request and repeats transfer when reused. The Files API suits repeated use and code-execution inputs: upload once, retain the returned identifier, and reference it later. It introduces storage lifecycle, platform availability, beta/version requirements, and retention implications. Anthropic's [Files API guide](https://platform.claude.com/docs/en/build-with-claude/files) documents upload, reference, download, and delete behavior (accessed 2026-07-27).

Treat delivery as backend policy, not a frontend serialization task. Validate media type, size, source ownership, and malware policy before upload. Store the original filename only as display metadata; never derive a filesystem path from it.

```ts
interface ContentBlockBuilder {
  buildDocument(
    file: AuthorizedFile,
    mode: "inline" | "files-api",
  ): Promise<{ block: DocumentBlock; uploadedFileId?: string }>;
}
```

Cache uploaded identifiers by a stable content hash or application file record so a retry does not re-upload the same bytes. Record who owns the file, when it may be deleted, and whether the provider copy must be removed when the user deletes the source.

### Put documents before the question

For PDF analysis, place document blocks before the text instruction in the same user content array. This keeps the reusable prefix stable and follows Anthropic's [PDF guidance](https://platform.claude.com/docs/en/build-with-claude/pdf-support) (accessed 2026-07-27).

```ts
const firstQuestion = {
  role: "user" as const,
  content: [
    documentBlock(source, safeTitle),
    { type: "text" as const, text: question },
  ],
};
```

PDFs can contain text, tables, charts, and images, but limits and platform behavior vary. Validate current page, payload, encryption, and model constraints before accepting an upload. Convert unsupported office formats to a supported text or PDF representation, or analyze them through code execution when their tabular structure matters.

### Enable citations as a data contract

Setting `citations.enabled: true` on documents asks Claude to return exact supporting locations alongside text blocks. PDF citations use page ranges; plain text uses character ranges; custom content documents use block ranges. Citation location indices do not all share the same base or end-index convention, so preserve the citation `type` and normalize deliberately.

Anthropic's [citations documentation](https://platform.claude.com/docs/en/build-with-claude/citations) explains the supported document types and location shapes (accessed 2026-07-27).

```ts
type CitationView = {
  sourceId: string;
  title: string | null;
  quotedText: string;
  locator:
    | { kind: "pages"; start: number; endExclusive: number }
    | { kind: "characters"; start: number; endExclusive: number }
    | { kind: "blocks"; start: number; endExclusive: number };
};
```

Do not treat a citation as proof that the claim is correct. It proves that the response points to supplied source text. Your UI should let users inspect the quoted passage and source location, distinguish sources clearly, and avoid inaccessible hover-only markers.

Citations can produce several text blocks, each with its own supporting references. Preserve that association instead of flattening all citations into one undifferentiated bibliography. If product rendering needs a flat list, also retain a mapping from each displayed claim or paragraph to its citation identifiers.

At the time of writing, citations and JSON structured outputs are incompatible because citations must interleave with text. If the product needs both grounded prose and typed fields, use separate calls or a workflow with a clear handoff rather than forcing them into one response.

### Own multi-turn session state

A document session typically stores:

```ts
interface DocumentSession {
  id: string;
  ownerId: string;
  sourceRecordId: string;
  providerFileId?: string;
  history: ConversationMessage[];
  createdAt: Date;
  expiresAt: Date;
}
```

On the first question, attach the document and question. On later questions, send the accepted history required for continuity. The backend—not the browser—authorizes the session and decides which document identifier and prior messages belong to it.

Store a resendable form of assistant content. Provider response blocks can contain metadata that is output-only or unsuitable for a later request. Build an explicit `toConversationHistory(response)` transformation, test every supported block type, and retain citations separately for display if the request format does not accept the response annotation unchanged.

In-memory maps are acceptable for a local demonstration, but production sessions need expiration, tenant isolation, concurrency control, and a durable store when multiple instances or restarts matter. Two simultaneous questions against one conversation require serialization or version checks to prevent lost history.

### Cache the stable document prefix

Prompt caching is useful when the same long document or instructions appear across follow-ups. Put `cache_control` at the end of the reusable prefix and resend that identical prefix on subsequent requests. A breakpoint is a request instruction, not a permanent flag stored at the provider.

```ts
const cachedDocument = {
  ...documentBlock(source, safeTitle),
  cache_control: { type: "ephemeral" as const },
};
```

The cache processes content in request order; changes before a breakpoint invalidate reuse after that point. Keep timestamps, the current question, and other variable data after the cached prefix. Anthropic's [prompt-caching guide](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) documents supported TTLs, minimum cacheable prefixes, and usage fields; these details vary by model and platform, so do not hard-code assumptions without current verification (accessed 2026-07-27).

Use response usage to distinguish cache creation from cache reads. A configured breakpoint can still produce neither—for example, when the prefix is below the applicable minimum. Measure observed behavior rather than reporting “cached” merely because the request contained `cache_control`.

A stable Files API identifier helps keep request bytes and cache prefixes stable, but file reuse and prompt caching solve different problems: the former avoids uploading bytes again; the latter avoids reprocessing an eligible prompt prefix.

### Failure modes and testing

Handle unsupported type, oversized or encrypted file, failed upload, stale file identifier, provider deletion, extraction failure, session expiry, cache miss, uncitable scan, and a response without usable text. A citation-free answer can be either a valid outcome or a product failure depending on the promise made to users; encode that decision.

Unit tests should cover inline and uploaded sources, upload reuse, document-before-question ordering, citation enablement and normalization, history sanitization, cache-control placement, first versus follow-up requests, delivery-mode changes, session authorization, and expiration. Integration tests should intercept file upload and Messages calls. Frontend tests should render multiple sources and citation types accessibly. Browser tests should ask at least one follow-up to prove session and cache behavior rather than testing only the initial upload.

Production telemetry should include source type, page/byte count, upload reuse, cache read/write tokens, citation count, session age, and failure class while excluding document contents by default.

## 8. Code Execution and Generated Artifacts

Code execution is useful when a task is better solved by computation than by prose: analyze a dataset, create a chart, transform files, or verify a calculation. Claude writes and runs code inside an Anthropic-managed container, and the response records tool activity and generated files.

This is a server-executed tool. Your backend enables it and interprets its response blocks; it does not run the generated command locally and does not implement a client `tool_result` loop.

### Move data into the container explicitly

A sandbox should not depend on reaching your database or private network. Assemble the smallest authorized dataset on the backend, serialize it to a suitable format, upload it, and attach it with a `container_upload` block.

```ts
const dataset = Buffer.from(JSON.stringify({ rows: authorizedRows }));
const uploaded = await claude.uploadFile({
  bytes: dataset,
  mediaType: "application/json",
  filename: "dataset.json",
});

const request: ClaudeRequest = {
  model: modelPolicy.forFeature("data-analysis"),
  max_tokens: 4_000,
  tools: [{ type: CURRENT_CODE_EXECUTION_TOOL, name: "code_execution" }],
  messages: [
    {
      role: "user",
      content: [
        { type: "container_upload", file_id: uploaded.id },
        { type: "text", text: analysisPrompt },
      ],
    },
  ],
};
```

The exact dated tool type and model compatibility are versioned capabilities. Resolve them in backend configuration and validate against Anthropic's current [code execution documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool) rather than copying a dated identifier throughout feature code (accessed 2026-07-27).

Upload data, not credentials. Remove fields the analysis does not require, enforce row and byte limits, and document retention. The Files API is the transport boundary for container inputs and generated outputs; a `document` block intended for Claude to read is not interchangeable with a `container_upload` intended to place a file in the execution environment.

### Treat tool activity as a typed response

A code-execution response can contain explanatory text, server tool-use blocks, execution-result blocks, and output-file references. Parse by block type and pair results using their identifiers rather than relying on array positions.

```ts
interface ExecutionRecord {
  command: string;
  stdout: string;
  stderr: string;
  returnCode: number;
}

interface GeneratedArtifact {
  fileId: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
}
```

Preserve stdout and stderr separately. A nonempty stderr stream does not always mean the command failed, and an empty stdout does not mean nothing happened. Use the reported return code and result error shape. Bound how much execution output enters your product response or logs; command output can be large and can contain input data.

Code execution may involve several internal steps inside one Messages API call. Keep the distinction between “one API call” and “one executed command” in telemetry.

### Download generated artifacts through the backend

Output references are not user downloads by themselves. The backend should retrieve each allowed file, validate metadata and size, and expose it through an application-owned download route or object store.

```ts
for (const ref of extractOutputFileReferences(response)) {
  const file = await claude.downloadFile(ref.fileId);
  validateGeneratedFile(file);
  await artifacts.store({
    ownerId: currentUser.id,
    sourceTurnId: turnId,
    filename: sanitizeFilename(file.filename),
    mediaType: file.mediaType,
    bytes: file.bytes,
  });
}
```

Avoid embedding large base64 files in a JSON response. A short-lived, authorized download URL scales better and permits malware scanning, content-disposition controls, quotas, and deletion. Render supported images or charts inline only after checking the media type; offer all other files as explicit downloads.

Generated files are untrusted output. Spreadsheet formulas, HTML, archives, and documents can carry active content. Scan or transform them according to product risk, never serve them from a privileged origin without appropriate headers, and do not trust filename extensions over inspected content.

### Add Skills when repetition justifies them

An Agent Skill packages reusable instructions and helper files for the code-execution container. It can standardize a spreadsheet export, report template, or domain-specific transformation. Skills are not needed for a one-off prompt; use them when a maintained capability should be available across many turns.

At a high level:

1. package a `SKILL.md` and required helper files;
2. register or reference the skill and retain its identifier;
3. attach that identifier in the request's container configuration; and
4. enable code execution and required feature headers.

Anthropic's [Agent Skills guide](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) documents current prerequisites and prebuilt/custom skill behavior (accessed 2026-07-27).

Register custom skills during deployment or through a durable provisioning path, not once per application process without persistence. Version skill contents and record the version used by each turn. Making a skill available does not guarantee Claude used it; infer use only from documented execution evidence, and label heuristic detection as such.

A skill is executable supply-chain material. Review helper scripts, pin dependencies where possible, restrict who can publish updates, and test the packaged files in the same runtime shape used in production.

### Design the user experience around a job

Code execution is slower and more failure-prone than a short message. Show distinct states for uploading, analyzing, running code, preparing artifacts, and completion when the backend can report them. Provide cancellation semantics honestly: stopping UI updates is not the same as terminating provider execution.

A useful result view separates:

- the answer or interpretation;
- commands/code, collapsed by default when aimed at non-developers;
- stdout, stderr, and return status for debugging audiences; and
- generated artifacts with filename, type, size, preview, and download action.

Never make a generated chart the only accessible representation of its findings. Include text or a data table, useful alt text, and keyboard-accessible downloads.

### Failure modes and verification

Handle source-data failure, upload failure, unsupported tool/model combination, container timeout, command failure, missing result pair, output too large, failed download, unsafe artifact, and partial success where analysis text exists but artifact creation failed. Decide whether partial artifacts are retained and make that status visible.

Unit tests should verify dataset minimization and serialization, upload and `container_upload` shape, tool selection, block pairing, stdout/stderr mapping, file extraction, size/type policy, download authorization, and optional skill attachment. Integration tests should intercept Files and Messages endpoints and include a realistic generated-file round trip. Frontend tests should cover no-code, failed-code, multiple-command, image-preview, and generic-download states. Browser tests should use deterministic fixtures rather than execute arbitrary live code.

Production telemetry should track upload size, tool version, container duration, command count, return codes, artifact count/bytes, download outcomes, and skill version—without logging dataset contents or generated files by default.

## 9. Web Search and MCP Connectors

Web search and the MCP connector let Claude reach information through server-executed tools. Your backend declares the tools and reads their activity from the response, while Anthropic executes the tool calls within the Messages request. This differs from a custom tool, where your application must execute a function and return `tool_result` blocks.

### Choose the execution boundary first

Use hosted web search when the product needs current public-web information and Anthropic's search behavior fits the trust and cost model. Use an MCP connector when an existing remote MCP server exposes the needed data or actions through a standard tool interface. Use a custom backend tool when access must pass through application-specific authorization, private infrastructure, transactional code, or a result contract you control.

The fact that a tool is server-executed does not make it automatically safe. Your backend still chooses which tool versions, domains, MCP servers, and individual operations are available.

### Configure web search as bounded research

```ts
const webSearchTool = {
  type: CURRENT_WEB_SEARCH_TOOL,
  name: "web_search",
  max_uses: 5,
  allowed_domains: ["standards.example.org", "docs.example.com"],
};
```

Use `max_uses` to bound search work and latency. Apply `allowed_domains` when the feature promises research from an approved corpus; use `blocked_domains` for narrower exclusions, but not both in one request. Domain policy should be ASCII-normalized and reviewed against organization-level restrictions.

Tool versions have meaningful differences, including dynamic filtering and response-inclusion behavior. Select one centrally and review its model, retention, and caller compatibility. Anthropic's [web search tool guide](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) and [server-tools guide](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools) describe the current options and result/error blocks (accessed 2026-07-27).

A `max_uses_exceeded` result is an in-response tool error, not necessarily an HTTP failure. Decide whether the model can still produce a useful partial answer and tell users when the research budget limited coverage.

### Connect MCP servers with least privilege

For the Messages API, an MCP request declares a named remote server and adds an `mcp_toolset` referring to that name.

```ts
const request: ClaudeRequest = {
  model,
  max_tokens: 3_000,
  mcp_servers: [
    {
      type: "url",
      name: "knowledge",
      url: config.approvedMcpUrl,
      authorization_token: resolvedToken,
    },
  ],
  tools: [
    webSearchTool,
    {
      type: "mcp_toolset",
      mcp_server_name: "knowledge",
      default_config: { enabled: false },
      configs: {
        search_docs: { enabled: true },
        read_doc: { enabled: true },
      },
    },
  ],
  messages: [{ role: "user", content: question }],
};
```

Keep MCP credentials in backend configuration or a secrets system and never return them in traces. Allowlist required operations instead of enabling everything a server may add later. Separate read-only research from write-capable MCP tools, and require application or human confirmation for consequential actions.

MCP is also a trust boundary. The remote operator controls tool descriptions, results, availability, and possibly newly exposed tools. Review the server, pin or govern its URL, restrict egress and tools, set timeouts, and treat returned content as untrusted. Anthropic's [Messages API MCP connector documentation](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector) covers server and toolset configuration (accessed 2026-07-27).

### Read server-tool activity from content blocks

A typical response can interleave:

- `server_tool_use` and a matching web-search result;
- `mcp_tool_use` and an MCP result;
- final text; and
- citations or structured content where compatible.

Do not create a client-tool loop merely because tool activity appears. Completed server tools include their results in the provider-managed turn. However, mixed client and server tool calls require care: a waiting client `tool_use` can defer a server result until your next request. Handle stop reasons and unmatched result identifiers according to the current server-tool continuation contract.

```ts
const searchesPerformed = response.content.filter(
  (block) => block.type === "server_tool_use" && block.name === "web_search",
).length;

const mcpCallsPerformed = response.content.filter(
  (block) => block.type === "mcp_tool_use",
).length;
```

Counts are useful operational metadata, not proof of research quality. Preserve result error blocks and surface partial coverage. An MCP-side failure or search-limit error may appear inside an otherwise successful HTTP response.

### Combine research with a product contract

For a machine-rendered brief, structured output can constrain the final answer while server tools gather evidence, subject to current feature compatibility.

```ts
const briefSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          sourceUrl: { type: "string" },
        },
        required: ["claim", "sourceUrl"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "findings"],
  additionalProperties: false,
} as const;
```

A source URL generated into JSON is not equivalent to an API citation. Validate URL schemes, render external links safely, and consider a prose-with-native-citations call when verifiable claim-to-source grounding matters more than a strict JSON shape. As noted earlier, native citations and JSON structured outputs are currently incompatible.

For high-stakes research, define source quality rules, date expectations, conflict handling, and a user-visible “insufficient evidence” outcome. Search breadth is not a substitute for evaluation.

### Handle continuation, errors, and streaming

Server-side tool loops can return a pause stop reason. Continue only under an application cap, preserving the required assistant content and tool definitions. Distinguish:

- request/transport failure;
- server-tool result error;
- MCP connection or authentication failure;
- research cap reached;
- partial answer with failed sources; and
- valid answer with no tool use.

When streaming, forward user-meaningful search/MCP activity without exposing credentials or sensitive arguments. Accumulate every supported provider block and wait for the terminal envelope before treating the brief as canonical.

### Test and operate research connectors

Unit tests should assert the selected tool versions, search caps, domain policy, MCP URL/name mapping, allowlisted tools, secret exclusion, structured schema, activity counters, result errors, pause handling, and no unnecessary custom-tool loop. Integration tests should intercept the Messages request and use fixtures containing successful and failed web/MCP result blocks. Frontend tests should render safe external links, activity counts, partial-result warnings, and no-result states.

Production telemetry should include tool version, searches and MCP calls, domains contacted when available, result-error types, pause continuations, latency, and usage. Monitor remote MCP schema changes and tool additions as dependency changes, not ordinary runtime noise.

## 10. Vision Features

Vision features send one or more images as typed content blocks alongside a text instruction. Useful products are narrower than “describe this image”: compare two versions, extract visible attributes for review, explain a chart, inspect damage, or answer questions about a screenshot.

### Build image inputs on the backend

Claude accepts supported images through base64, URL, or Files API references, depending on platform. As with documents, keep source fetching and authorization on the backend.

```ts
type ImageSource =
  | { type: "base64"; media_type: ImageMediaType; data: string }
  | { type: "url"; url: string }
  | { type: "file"; file_id: string };

function imageBlock(source: ImageSource) {
  return { type: "image" as const, source };
}
```

For user uploads or private images, fetch or receive bytes through an application-controlled path, verify the actual media type, decode dimensions, strip unnecessary metadata when policy requires it, and reject unsupported or oversized files before calling Claude. Do not let the model or browser turn an arbitrary URL into unrestricted backend fetching; apply SSRF protections and an allowlist where remote URLs are accepted.

Inline base64 is convenient for a one-off image. Files API references reduce repeated payload size in multi-turn conversations. URL sources avoid transfer through your service only when the image is safely and reliably public. Anthropic's [vision guide](https://platform.claude.com/docs/en/build-with-claude/vision) documents current source types, formats, limits, and cost behavior (accessed 2026-07-27).

### Put images before the instruction

Place images before the question when practical. For several images, add short stable labels so the prompt and response can refer to them unambiguously.

```ts
const content = images.flatMap((image, index) => [
  { type: "text" as const, text: `Image ${index + 1}:` },
  imageBlock(image.source),
]);

content.push({
  type: "text",
  text: "Compare the visible layout changes. Report only differences you can observe.",
});
```

Retain an application-side mapping from label to source record. Do not rely on filenames or ordering reconstructed from the model response. In the UI, show the same labeled thumbnails next to the result so users can verify which inputs were analyzed.

### Design comparison as one joint request

When the task depends on relationships among images, send them in one request. Separate calls followed by text aggregation lose direct visual comparison and can produce incompatible descriptions. Ask for the exact comparison axes needed by the product—layout, color, visible text, missing components—rather than an unrestricted narrative.

Structured output can help when code consumes detected fields, but schema validity does not guarantee visual accuracy. For coordinates, preserve the dimensions of the image Claude actually sees and follow the current resizing guidance; coordinates against a resized image do not automatically map to the original.

### Enforce current limits before the API

Image count, dimensions, encoded size, request size, model resolution, and partner-platform limits can all apply. These values evolve. Keep them in validated configuration sourced from current provider documentation, and return a user-correctable validation error before upload or inference.

As of the access date, Anthropic documents an 8000-by-8000 maximum per image and a stricter per-image rule for API requests containing more than 20 images; it recommends keeping dimensions at or below 2000 pixels to remain portable across platforms for many-image requests. Recheck before release rather than treating these numbers as permanent.

Large images may be downscaled before inference, affecting small text and coordinates. Pre-resize when full resolution is unnecessary, and inspect the actual transformed image in tests. Compression reduces payload latency but can damage OCR and fine detail.

```ts
interface PreparedImage {
  sourceRecordId: string;
  mediaType: ImageMediaType;
  width: number;
  height: number;
  byteLength: number;
  source: ImageSource;
}
```

Expose derived metadata such as “resized before analysis” or “many-image limit applied” from your own preparation pipeline. The model response is not the authority for what bytes or dimensions were sent.

### Render sources and uncertainty together

A vision result should include source thumbnails, labels, the model answer, and relevant transformations. Preserve aspect ratio and provide useful alt text based on known source metadata rather than using the model answer as the image alternative.

Vision is not precise measurement by default. Counting, fine spatial localization, tiny text, identity, synthetic-image detection, and specialized medical imagery have important limitations. Phrase the product promise accordingly, show uncertainty where it affects decisions, and require human verification for high-stakes outcomes.

When streaming a prose answer, reuse the terminal-event contract from Chapter 3. Image upload and preprocessing occur before model deltas, so expose an explicit preparing state. A cancelled browser request should clean up temporary files according to policy even if provider work cannot be stopped immediately.

### Security and privacy

Images can contain faces, documents, location clues, screens, access tokens, and other sensitive information. Define collection purpose, retention, deletion, and human-access policy. Remove EXIF data when it is not required. Never log base64 image bodies, signed URLs, or extracted text by default.

Treat visible text in images as untrusted input. A screenshot can contain prompt-injection instructions just as a web page can. Tool permissions and application policy must remain independent of anything Claude reads in an image.

### Failure modes and testing

Handle unsupported format, corrupt decode, animated input, excessive dimensions or bytes, too many images, source-fetch timeout, fewer images than the workflow requires, provider rejection, answer without text, and partial upload cleanup. Do not silently compare fewer images than the user selected; that changes the task.

Unit tests should cover every source mode, content ordering and labels, media sniffing, dimension/count boundaries, preprocessing metadata, multi-image request shape, stop reasons, and streaming terminal behavior. Integration tests should intercept image fetch/upload and Messages calls without embedding sensitive fixtures. Frontend tests should render ordered thumbnails, preparation and analysis states, transformation warnings, accessible results, and failures. Browser tests should include one single-image task and one true comparison.

Evaluate vision quality on a representative labeled set, including difficult lighting, blur, rotation, small text, and near-duplicate images. Production telemetry should record image count, dimensions, bytes, preparation transforms, model profile, latency, usage, and failure class while keeping image content out of ordinary logs.

## 11. Extended Thinking

Thinking controls are useful when a task benefits from additional reasoning before the final answer: difficult analysis, planning, mathematics, coding, or decisions across competing constraints. They are not a universal quality switch. Extra reasoning can increase latency and cost without improving a simple task.

### Select tasks before selecting settings

Start with an evaluation set that contains genuinely difficult representative tasks. If a direct response already meets the product threshold, thinking adds complexity without user value. Good candidates have verifiable outcomes or reviewable rubrics; vague “seems smarter” comparisons are difficult to operationalize.

Choose a product policy such as:

- omit thinking for short extraction, rewriting, or routine classification;
- enable adaptive thinking for complex requests where the model should decide whether reasoning is useful;
- use higher effort only for a measured quality gain; and
- reserve the most expensive setting for explicit high-value cases.

Thinking and effort are related but distinct. On supported models, adaptive thinking controls whether and how the model reasons in thinking blocks, while `output_config.effort` influences work across the entire response, including answer text and tool calls. Anthropic's [effort guide](https://platform.claude.com/docs/en/build-with-claude/effort) documents current levels and model support (accessed 2026-07-27).

### Resolve a version-aware reasoning profile

Thinking support differs by model generation. Some current models recommend or require adaptive thinking; older models use manual token budgets; some models keep thinking on by default. Centralize these differences rather than letting feature code assemble arbitrary combinations.

```ts
type ReasoningProfile =
  | { mode: "default" }
  | {
      mode: "adaptive";
      effort: "low" | "medium" | "high";
      display: "omitted" | "summarized";
    }
  | {
      mode: "manual";
      budgetTokens: number;
      display: "omitted" | "summarized";
    };

function applyReasoningProfile(
  request: ClaudeRequest,
  profile: ReasoningProfile,
  capabilities: ModelCapabilities,
): ClaudeRequest {
  return capabilities.buildReasoningRequest(request, profile);
}
```

Do not infer support from a model name with scattered string checks. Maintain a tested capability table sourced from current provider documentation. Reject unsupported combinations before the network call and log the resolved profile.

Anthropic's [thinking documentation](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) describes adaptive/manual modes, thinking blocks, tool-use continuity, and current compatibility (accessed 2026-07-27).

### Compare one variable at a time

A useful benchmark holds the model, task, prompt, data, tool set, and output budget constant while varying the reasoning profile.

```ts
const profiles = [
  { label: "baseline", profile: { mode: "default" } },
  {
    label: "adaptive-medium",
    profile: { mode: "adaptive", effort: "medium", display: "summarized" },
  },
  {
    label: "adaptive-high",
    profile: { mode: "adaptive", effort: "high", display: "summarized" },
  },
] satisfies BenchmarkProfile[];

const runs = await Promise.all(
  profiles.map((item) => runMeasured(task, item)),
);
```

Parallel comparison reduces wall-clock time but changes load conditions. For rigorous latency measurement, repeat runs, randomize execution order or run sequentially under controlled conditions, and report distributions rather than one sample. Model output is nondeterministic; one side-by-side result is an illustration, not an evaluation.

### Extract answers and thinking separately

A response can contain thinking-related blocks followed by text blocks. Parse by type.

```ts
function summarizeRun(response: ClaudeMessage): RunResult {
  const answer = response.content
    .filter(isTextBlock)
    .map((block) => block.text)
    .join("");

  const thinking = response.content
    .filter(isThinkingBlock)
    .map((block) => block.thinking)
    .join("\n\n") || null;

  return {
    answer,
    thinking,
    usage: mapUsage(response.usage),
    stopReason: response.stop_reason,
  };
}
```

Display configuration matters. An omitted setting can allow thinking while returning no readable thinking text; a summarized setting returns a presentation suitable for inspection where supported. Treat returned thinking as model output, not a complete audit trail or proof that the final answer is correct. Do not expose it automatically to end users: it can confuse, disclose sensitive prompt context, or create a false sense of certainty.

For most products, show the final answer and perhaps a brief product-authored rationale or citations. Reserve thinking display for authorized evaluation, debugging, or an experience whose users understand its limitations.

### Preserve thinking blocks during tool loops

When thinking and client tools are combined, pass the latest assistant content back exactly as returned, including `thinking` and `redacted_thinking` blocks. Do not filter, reorder, edit, or reconstruct them. The API verifies these blocks and can reject modified histories.

```ts
request = {
  ...request,
  messages: [
    ...request.messages,
    { role: "assistant", content: response.content }, // unchanged
    { role: "user", content: toolResults },
  ],
};
```

Keep one thinking mode for the whole assistant turn. Forced tool choices can be incompatible with thinking on supported models, so validate tool configuration as part of the model profile. Interleaved thinking behavior and required headers vary by model generation; use current capability metadata.

### Measure the actual tradeoff

For every profile, collect:

- task-quality score and human acceptance;
- total and first-content latency;
- input, output, and reported thinking-token usage where available;
- tool-call count and failed tool attempts;
- stop reason and truncation;
- estimated cost; and
- variance across repeated runs.

Higher effort can change tool selection and answer length, so comparing only “thinking tokens” misses part of the cost. Ensure `max_tokens` leaves room for both reasoning and the final answer on configurations where they share the output ceiling. A truncated high-effort run may look worse simply because the budget was not comparable.

Quality needs task-specific measures: correctness for calculations, executable tests for code, rubric-based review for prose, groundedness for research, and downstream success for workflows. Blind pairwise review reduces bias when humans compare answers.

### Build a comparison UI that informs decisions

A useful internal bench shows each profile's final answer, returned thinking summary when enabled, latency, usage, stop reason, and evaluation score. Keep columns aligned and label missing thinking as “not returned,” not “no reasoning occurred.” Provide raw request/response inspection only to authorized users.

Avoid declaring a winner from latency or token count alone. Show the quality/cost frontier and let the product team choose the lowest-cost profile that meets the acceptance threshold.

### Failure modes and testing

Handle unsupported mode/model combinations, invalid manual budgets, insufficient output budget, thinking omitted by configuration, redacted blocks, modified-history rejection, truncation, stream reconstruction, and one failed run in a comparison batch. Decide whether a partial comparison remains useful or the whole benchmark fails.

Unit tests should assert exact profile-to-request mapping, model held constant, block extraction, unchanged thinking-block replay, usage mapping, and stop-reason handling. Integration tests should include realistic thinking and redacted-thinking fixtures. Frontend tests should distinguish disabled, omitted, summarized, failed, and truncated runs. Benchmark tests should use a frozen evaluation set and report repeatable aggregate statistics rather than assert exact model prose.

In production, monitor reasoning profile, task class, latency, usage, tool calls, quality proxy, and user outcome. Re-evaluate profiles when models or defaults change; yesterday's high-effort advantage may become tomorrow's unnecessary cost.

## 12. Agents as a Deliberate Exception

An agent gives Claude a goal and a set of tools, then lets it choose the sequence of observations and actions. This flexibility is valuable when the useful path cannot be enumerated in advance. It is also why an agent should be a deliberate exception rather than the default implementation for every multi-step feature.

### Establish that the path is genuinely unknown

Use an agent when success may require exploring an environment, revising a plan after new evidence, or selecting an unpredictable number and order of tools. Repository investigation, open-ended incident diagnosis, and research across heterogeneous sources can fit.

Prefer a fixed workflow when the stages, branches, or approval points are known. A workflow offers clearer latency, cost, evaluation, and failure behavior. Before building an agent, prototype the task with the message, structured-output, tool, and workflow patterns from earlier chapters.

Anthropic's [Building Effective AI Agents](https://www.anthropic.com/engineering/building-effective-agents) recommends starting with simple composable patterns and adding autonomous behavior only when it improves outcomes (accessed 2026-07-27).

### Give the agent an outcome, boundaries, and completion criteria

A good agent system prompt defines:

- the goal and what counts as a finished answer;
- available data and tool semantics;
- actions it must not take;
- when to verify an observation;
- when to ask for human input; and
- how to report uncertainty or incomplete work.

Do not encode access control only in prose. Tool implementations, credentials, tenant scope, and confirmation gates enforce the actual boundary.

```ts
const agentRequest: ClaudeRequest = {
  model: modelPolicy.forFeature("repository-investigation"),
  max_tokens: 4_000,
  system: `Investigate the repository and explain its architecture.
Use tools to inspect evidence before concluding.
Cite the file paths that support important claims.
If the available evidence is insufficient, say what remains unknown.`,
  tools: [listFilesTool, searchPathsTool, readFileTool, knowledgeTool],
  messages: [{ role: "user", content: goal }],
};
```

A fixed goal is often safer than an unrestricted user goal for the first production version. Expand scope after evaluation shows which requests are useful and which permissions they require.

### Offer small, composable tools

Abstract tools let the agent form its own plan: list, search, read, inspect metadata, or request a narrow calculation. Avoid one tool that performs an entire hidden workflow; that gives the model little useful feedback and makes failures opaque.

Each tool should have one clear effect, bounded output, runtime validation, authorization, timeout, and stable error semantics. Read-only tools are the safest starting point. For writes, separate propose, preview, and commit operations, and require confirmation at the application boundary.

Tool results are observations, not instructions. Keep external and repository content in tool-result blocks and treat it as untrusted. An agent that can read adversarial content and call powerful tools needs stronger isolation than an ordinary chat feature.

### Drive a capped loop

The loop resembles custom tool use, but its purpose is open-ended progress toward a goal. Bound every resource that can grow.

```ts
const limits = {
  maxModelCalls: 12,
  maxCustomToolCalls: 20,
  maxWallTimeMs: 90_000,
  maxEstimatedCostUsd: 1.00,
};

async function runAgent(initial: ClaudeRequest): Promise<AgentResult> {
  let request = initial;
  const calls: AgentCall[] = [];
  const activity: ToolActivity[] = [];
  const startedAt = Date.now();
  let customToolCalls = 0;

  for (let modelCall = 1; modelCall <= limits.maxModelCalls; modelCall += 1) {
    assertWithinTimeAndCost(startedAt, calls, limits);
    const response = await claude.createMessage(request);
    calls.push({ modelCall, request, response });

    if (response.stop_reason !== "tool_use") {
      return finalizeAgent(response, calls, activity, { limitReached: null });
    }

    const requested = response.content.filter(isClientToolUse);
    if (customToolCalls + requested.length > limits.maxCustomToolCalls) {
      return finalizeAgent(response, calls, activity, {
        limitReached: "custom_tool_calls",
      });
    }

    const results = await executeAndRecord(requested, activity);
    customToolCalls += requested.length;
    request = appendUnmodifiedAssistantAndResults(request, response, results);
  }

  return finalizeAgent(lastResponse(calls), calls, activity, {
    limitReached: "model_calls",
  });
}
```

Define precisely what a cap counts. Model calls, client-tool executions, server-tool activity, and loop rounds are different. Check a budget before performing the action it limits, then return a truthful incomplete status. Do not present the last partial text as a normal successful answer merely because a loop ended.

SDK tool runners can manage standard message history, execution, error wrapping, and iteration caps. Use one when its lifecycle matches your needs; retain a manual loop for custom approval, telemetry, mixed execution policy, or unusual recovery. Anthropic's [Tool Runner guide](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-runner) documents current behavior and `max_iterations` support (accessed 2026-07-27).

### Handle custom and server tools by execution boundary

An agent may combine backend-executed tools with web search, code execution, or MCP. Only unresolved client `tool_use` blocks require your backend to execute functions and append `tool_result` blocks. Completed server-tool blocks are observations within the provider response.

Mixed turns and server-side pauses require stop-reason-aware continuation. Preserve the tools array and assistant content exactly where the API contract requires it. Count server-tool uses in activity and budgets even when they do not create an application-side loop iteration.

```ts
interface ToolActivity {
  sequence: number;
  modelCall: number;
  execution: "client" | "server";
  tool: string;
  inputSummary: unknown;
  outcome: "succeeded" | "recoverable-error" | "failed";
  durationMs?: number;
}
```

Use a stable sequence number rather than inferring activity order later from several block types. Redact or summarize arguments before returning activity to the browser.

### Make environmental feedback visible

Agents improve their plan through observations. Preserve each request, response, tool call, result, and recoverable error in a correlated trace. This reveals whether the agent gathered evidence, repeated itself, ignored an error, or concluded prematurely.

Repeated inspection is not automatically waste. Re-reading a file after discovering new context can be verification; repeating the same call with the same input and no changed state can signal a loop. Detect exact and semantic repetition, expose it in internal telemetry, and consider terminating after a repeated-no-progress threshold.

The product UI should show concise, user-safe activity such as “searched repository paths” or “read configuration file,” not hidden reasoning or raw private data. Users need enough feedback to understand progress, cancel, and review consequential actions.

### Extract completion conservatively

A final non-tool response can contain several text and non-text blocks. Inspect the stop reason, concatenate or render supported text blocks deliberately, and preserve citations and artifacts separately. Return explicit status:

```ts
interface AgentResult {
  status: "completed" | "incomplete" | "failed" | "awaiting-approval";
  finalAnswer: string | null;
  limitReached: "model_calls" | "custom_tool_calls" | "time" | "cost" | null;
  calls: AgentCall[];
  activity: ToolActivity[];
  usage: TurnUsage;
}
```

A refusal, truncation, context limit, cap, cancellation, or approval pause is not ordinary completion. The UI should preserve useful partial work while stating why the run stopped and what the user can do next.

### Put humans around consequential actions

For side effects, let the agent prepare an action and pause before execution. Show the exact target and diff or payload, validate that it still applies, then require an authorized confirmation. Approval should be bound to that action version; changing arguments invalidates it.

Use idempotency keys and preconditions for committed actions. Log who approved, what executed, and the result. Never allow a generic “approved” flag in conversation text to substitute for application authorization.

### Manage context and long-running work

Agent histories grow through tool definitions, observations, thinking blocks, and repeated turns. Set context thresholds and use supported context editing, compaction, retrieval, or a durable state summary. Never drop the latest assistant tool request or its required result pairing. Preserve thinking-related blocks unchanged where the selected model requires them.

Long runs are better modeled as jobs with persisted checkpoints, cancellation, and resumable state than as one browser connection. Store only what is needed for continuation and audit, with explicit retention and redaction.

### Test trajectories and adversarial behavior

Unit tests should cover no-tool completion, each tool, several tools in one response, recoverable errors, unknown tools, mixed server/client activity, pause continuation, every stop reason, each budget, cancellation, repeated-no-progress detection, approval, immutable traces, and final-answer extraction.

Integration tests should intercept multi-call Messages trajectories and real external-client boundaries. Browser tests should use deterministic fixtures for a successful investigation, cap exhaustion, and approval pause. Never rely on a live model to choose the exact same path in CI.

Evaluation must measure outcome quality, evidence coverage, unnecessary calls, repeated actions, unsafe attempts, latency, cost, and human intervention. Include adversarial tool content, misleading files, missing data, dependency errors, and goals that should be refused. A capable happy path is insufficient evidence for production autonomy.

### Operational checklist for an agent

Before release, confirm that:

- a fixed workflow cannot meet the requirement more simply;
- every tool is least-privilege and independently authorized;
- all model, tool, time, context, and cost budgets are enforced;
- consequential actions require bound approval and idempotency;
- all activity is traceable without leaking sensitive content;
- partial and capped outcomes are visible and recoverable;
- deterministic trajectory tests cover failures and attacks; and
- quality and safety evaluations run continuously after model or tool changes.

An agent earns its complexity when its freedom to choose steps produces measurable value. Otherwise, convert the observed successful trajectories into a simpler workflow.

## 13. Testing and Operational Hardening

AI features need ordinary software tests and model-behavior evaluations. These solve different problems. Tests prove that contracts, orchestration, permissions, and failure paths behave deterministically. Evaluations measure whether variable model outputs are useful, correct, grounded, and safe.

### Build a layered verification strategy

Use the smallest test level that can catch the intended regression:

| Layer | Runs | External boundary | Best for |
|---|---|---|---|
| Backend unit | Feature/service code | Injected fakes | Request building, loops, routing, parsing, caps |
| Backend integration | Real application HTTP pipeline | Intercepted provider/data HTTP | Routing, validation, DI, SDK wire shape, error mapping |
| Frontend unit | Components and services | Mock application HTTP | Request shaping, rendering, stream parsing, accessibility |
| Frontend integration | Frontend HTTP code plus running backend | Backend uses deterministic doubles | Real application contract and SSE transport |
| Browser E2E | Real browser plus running stack | Whole stack uses deterministic doubles | Navigation, interaction, progressive UI, downloads |
| Model evaluation | Evaluation harness | Controlled real model calls | Semantic quality, groundedness, safety, cost/quality tradeoffs |

Do not duplicate every assertion at every level. Unit tests cover permutations and edge cases; integration tests cover representative wire contracts; browser tests cover a few critical journeys. Evaluations run on curated datasets under explicit budgets, not as ordinary unit tests.

### Put every external system behind a seam

Feature code should depend on interfaces for Claude and each external data source. A test fake records requests and returns queued responses.

```ts
class FakeClaudeClient implements ClaudeClient {
  readonly requests: ClaudeRequest[] = [];
  private readonly responses: ClaudeMessage[] = [];

  queue(response: ClaudeMessage): void {
    this.responses.push(structuredClone(response));
  }

  async createMessage(request: ClaudeRequest): Promise<ClaudeMessage> {
    this.requests.push(structuredClone(request));
    const response = this.responses.shift();
    if (!response) throw new Error("No fake Claude response queued");
    return structuredClone(response);
  }
}
```

Fail loudly when a unit test makes an unplanned call. A generic fallback can be useful in an interactive demo mode, but it should not hide missing setup in tests. Keep reusable message, stream, tool, citation, thinking, and artifact builders in one test-support module rather than inventing inconsistent mocks per feature.

A fake is not evidence that the real adapter serializes correctly. That belongs in backend integration tests that run the actual SDK/client while intercepting outbound HTTP and returning provider-shaped fixtures. Disable external network access in those tests, permitting only loopback to the application under test. An unmatched request should fail rather than escape to the internet.

### Keep automated tests credential-free

No unit, integration, frontend, or browser test should require a real API key. Use placeholders only where startup configuration validates that a variable exists; ensure no real network route can consume them. CI secrets should not be needed for deterministic application tests.

Real-model evaluations are a separate, explicitly invoked workload with their own credential, dataset, budget, retention policy, and result store. Never make a pull request's correctness depend on nondeterministic prose from a live model.

An interactive fake/demo mode is also separate from test injection. Demo mode lets a running application behave plausibly without credentials. Tests bind fakes directly and script exact trajectories. Do not multiply every feature test across “fake mode” and “real mode” when shared binding and real-adapter tests already cover that switch.

### Test requests as product contracts

For each feature, assert the fields that encode a decision:

- model profile, system prompt, and output budget;
- message/content-block ordering;
- structured schema or tool definitions;
- thinking and effort profile;
- file, citation, cache, MCP, or hosted-tool configuration;
- omission of unsupported fields; and
- authorization-derived context that must not come from the browser.

Avoid asserting an entire large request snapshot when only one behavior matters; broad snapshots make intentional changes noisy and can obscure a dangerous field. Use focused structural assertions plus a small number of complete wire fixtures.

For multi-call behavior, assert the exact sequence, not only the final answer. A workflow test should catch an accidental extra call; a tool-loop test should prove the assistant response and matching results are appended correctly; an agent test should prove caps stop execution before the forbidden next action.

### Script trajectories, not exact prose

A deterministic test describes the path Claude takes:

```ts
fake.queue(toolUseMessage("lookup_order", "toolu_1", { orderId: "ORD-7" }));
fake.queue(textMessage("Your order ships tomorrow."));

const result = await service.run(input);

expect(fake.requests).toHaveLength(2);
expect(lastUserContent(fake.requests[1])).toEqual([
  expect.objectContaining({
    type: "tool_result",
    tool_use_id: "toolu_1",
  }),
]);
expect(result.status).toBe("completed");
```

Cover meaningful trajectories: direct answer, one tool, parallel tools, recoverable error and self-correction, external failure, refusal, truncation, stream failure, cap exhaustion, approval pause, and cancellation. For workflows, cover every route and retry boundary. For structured output, cover semantically wrong but structurally valid data in evaluations, while tests cover parsing and validation mechanics.

### Reconstruct streaming exhaustively

A stream accumulator is shared infrastructure and deserves focused tests for every supported event and delta type. Verify indexed content blocks, partial JSON arguments, citations, thinking/signatures, usage merging, unknown events, error events, and missing terminal events.

Network chunks do not equal SSE frames. Frontend parser tests must split every delimiter across chunks, combine several frames into one chunk, include multibyte UTF-8 boundaries, and end with leftover/incomplete data. Assert that provisional content does not become canonical without `turn_complete`.

Use compile-time exhaustiveness for known event unions and a safe runtime policy for future event types. Provider documentation explicitly allows event types to expand; unknown progress events should not crash the UI, while an unknown event required for correct reconstruction should fail visibly in protected telemetry.

### Test the application error taxonomy

Use distinct cases and public contracts:

| Failure | Transport | Retry owner | User outcome |
|---|---|---|---|
| Validation/authorization | HTTP 4xx before model call | User/application | Correct input or permission |
| Claude API failure | HTTP 5xx mapping or stream error | Backend policy | Retry later or degraded path |
| External data-source failure | HTTP 5xx mapping or stream error | Backend policy | Explain unavailable dependency |
| Recoverable tool failure | `tool_result` with `is_error: true` | Claude within cap | Self-correct or explain limitation |
| Mid-stream failure | Terminal application stream error | User/backend policy | Preserve partial display, do not commit it |
| Model refusal or truncation | Successful HTTP with stop reason | Product policy | Explicit refused/incomplete state |
| Workflow/agent cap | Successful controlled result | User/product | Incomplete result with cap reason |

Public errors should be safe and actionable; internal logs retain the typed cause, stack, provider request ID, and correlation ID under access control. Do not return raw SDK messages indiscriminately because they can expose request details.

Anthropic's [API error guide](https://platform.claude.com/docs/en/api/errors) documents typed SDK exceptions, error response shapes, and provider request IDs (accessed 2026-07-27). Capture the provider request ID whenever available so an incident can be correlated with support without logging full prompts.

### Retry only operations that are safe to repeat

The official SDK retries some connection, timeout, conflict, rate-limit, and server failures by default. Know the adapter's configured retry count before adding another retry layer; nested retries can multiply latency and load.

Use exponential backoff with jitter for transient failures and honor `retry-after`. Anthropic's [rate-limit guide](https://platform.claude.com/docs/en/api/rate-limits) describes request/token limits, acceleration limits, and response headers (accessed 2026-07-27). Do not hard-code organization limits into feature code.

Retry read-only calls more freely than side effects. Use idempotency keys, preconditions, and persisted operation state for custom tools that write. Never invisibly restart a response after partial text reached the user; the replacement can differ. Surface a retry action or resume from a documented checkpoint.

### Test the frontend as a state machine

For every AI interaction, cover:

- initial and input-validation states;
- queued/preparing state;
- provisional streaming content;
- tool or workflow activity;
- canonical completion;
- valid empty/partial result;
- cancellation;
- retriable and non-retriable errors; and
- a second run that replaces or preserves prior results intentionally.

Keep the result region mounted with shaped placeholders when removing it would cause layout jumps. Verify focus movement, live-region behavior, keyboard access to citations/downloads, color-independent status, and reduced-motion behavior. Tests should use semantic roles and product-facing labels rather than brittle DOM positions.

### Keep browser tests narrow and realistic

Browser E2E catches failures that isolated component tests cannot: routing, proxying, real fetch streaming, content security headers, focus, downloads, and integration between shared components. Run it against a fully started deterministic stack and assert the environment is fake before the suite begins.

Give each major feature one representative happy path plus only browser-specific critical failures. Do not repeat every backend edge case through clicks. When a DOM change affects selectors or structure, inspect the browser spec as well as the component test; they are different consumers of the markup.

### Add semantic evaluations

Create a versioned evaluation record:

```ts
interface EvaluationCase {
  id: string;
  input: unknown;
  expectedFacts?: string[];
  rubric: string;
  forbiddenBehaviors?: string[];
  tags: string[];
}
```

Use deterministic checks when possible: schema validation, exact citations, executable tests, numeric answers, required/forbidden tool calls, and policy rules. Add blinded human review or calibrated model grading for subjective qualities. A model grader should not be the sole judge of high-stakes correctness.

Track prompt version, model identifier, reasoning profile, tool versions, dataset version, latency, usage, and outcome. Compare distributions and confidence intervals rather than one run. Maintain slices for difficult, multilingual, adversarial, long-context, and accessibility-relevant cases. Set release thresholds before looking at results.

### Exercise security and privacy boundaries

Tests should prove tenant isolation, authorization derived from server identity, file ownership, MCP/tool allowlists, side-effect confirmation, output sanitization, download authorization, secret redaction, and retention/deletion. Include indirect prompt injection in retrieved text, documents, images, and tool results. Verify that hostile content cannot expand tool authority.

Run dependency, static-analysis, and secret-scanning tools alongside application tests. Treat Skills, MCP servers, prompt templates, schemas, and tool definitions as versioned supply-chain inputs requiring review.

### Verify builds and production topology

A passing unit suite does not prove compilation, lint, assets, or deployment packaging. Run the actual type check/build, lint, backend integration suite, frontend compilation, and browser suite used by CI. Verify non-code runtime assets such as Skill files and templates exist in the built artifact.

Test the production path for proxy buffering, SSE timeouts, maximum request sizes, body parsing, download headers, cancellation propagation, and graceful shutdown. Load-test representative token and concurrency profiles with deterministic substitutes first; use carefully budgeted real-model tests only for provider-facing behavior.

### Observe and roll out safely

Correlate one user turn across model calls, tools, data sources, and streaming. Record model/profile, prompt and schema versions, stop reason, usage, cache behavior, latency by stage, retry count, tool outcomes, cap status, and provider request IDs. Keep prompt/content capture off by default or subject to explicit redaction, consent, access, and retention controls.

Release behind a flag or limited cohort. Define rollback and degradation: disable a risky tool, switch to a simpler workflow, return a non-AI path, or queue work for later. Monitor quality signals alongside latency, errors, and cost. A technically healthy endpoint can still produce a poor product outcome.

### Verification checklist for every AI feature

Before calling a feature ready, confirm:

- application contracts and stop reasons are explicit;
- unit tests cover request decisions and all orchestration branches;
- integration tests prove the real SDK wire shape without network access;
- frontend tests cover the full interaction state machine;
- browser tests cover the critical real transport journey;
- no automated suite uses a real credential;
- deterministic fakes fail on unscripted calls;
- retries, timeouts, cancellation, and idempotency are defined;
- semantic evaluations meet predeclared quality and safety thresholds;
- security, privacy, accessibility, cost, and latency have owners;
- observability excludes sensitive content by default; and
- rollout, rollback, and dependency-change procedures exist.

## Putting It Together

The preceding patterns are most useful when composed around one user outcome. Consider a support-response assistant for a complex customer case. An agent could be given broad access and told to “resolve the case,” but the useful steps are known well enough to build a controlled workflow.

### Representative feature: grounded support response

The user selects a case, adds a question, and requests a draft response. The product must use authorized account data and policy documents, show sources for policy claims, evaluate the draft, and require human review before anything is sent.

```text
Browser
  |  case ID + instruction
  v
Backend authorization and validation
  |-- load case metadata and document identifiers
  |-- route case with structured output
  |-- fetch account facts through application clients
  |-- draft against citable policy documents
  |-- evaluate draft with structured output
  `-- return answer, citations, grades, usage, and trace ID
  v
Human review UI
  |-- inspect sources and warnings
  `-- edit or approve through a separate application action
```

The feature is a fixed workflow because routing, evidence gathering, drafting, grading, and approval are known stages. Claude supplies judgment inside those stages; it does not decide whether authorization or approval is required.

### 1. Accept an application request

```ts
interface DraftSupportResponseInput {
  caseId: string;
  instruction: string;
  stream: boolean;
  clientTurnId: string;
}
```

The browser does not supply account identifiers, model names, system prompts, policy file IDs, or tools. The backend authorizes the case, resolves tenant-scoped context, checks the idempotency identifier, and rejects empty or excessive input before any model call.

The UI immediately renders a stable pending region. If streaming is enabled, it connects through a POST response-body stream and waits for application events rather than provider-specific UI logic.

### 2. Route with structured output

A small classification call selects `billing`, `technical`, `account`, or `other`. The schema is closed, runtime-validated, and paired with a safe fallback. Routing uses the least expensive model profile that meets an evaluated accuracy threshold.

The route controls which data clients and policy corpus are eligible. It does not alter the user's permissions.

### 3. Gather facts through deterministic code and narrow tools

Known case metadata should be loaded with ordinary backend clients before drafting; no model call is needed to retrieve a record the application already knows it requires. If the draft sometimes needs optional facts, offer read-only custom tools such as `lookup_invoice` or `get_service_status`.

Each tool derives tenant and user identity from backend context, validates model-supplied record identifiers, and returns minimized data. A missing optional record becomes an `is_error: true` tool result; an unavailable billing service fails the workflow. Tool calls, results, and retries are retained in the protected trace.

### 4. Draft with grounded documents and citations

The backend references approved policy documents by Files API identifier, places them before the drafting instruction, enables citations, and marks the stable document prefix for prompt caching.

```ts
const draftRequest: ClaudeRequest = {
  model: profiles.get("support-drafting").model,
  max_tokens: 2_000,
  system: SUPPORT_DRAFTING_PROMPT,
  tools: toolsForRoute(route),
  messages: [
    {
      role: "user",
      content: [
        ...policyDocuments.map(cachedCitableDocumentBlock),
        { type: "text", text: buildCaseInstruction(caseData, instruction) },
      ],
    },
  ],
};
```

The stream emits text deltas and safe tool-activity events. The browser labels them provisional. The terminal envelope contains the canonical draft, claim-to-source citations, usage, cache status, warnings, and a trace identifier.

### 5. Evaluate in a separate structured call

Native citations and JSON structured output are currently incompatible in one response, so evaluation is a separate call. It receives the completed draft plus the minimum evidence needed to grade tone, policy compliance, unsupported promises, and completeness.

```ts
interface DraftEvaluation {
  passed: boolean;
  criteria: Array<{
    name: "tone" | "policy" | "groundedness" | "completeness";
    passed: boolean;
    feedback: string;
  }>;
}
```

Independent criteria can run in parallel when latency and rate limits permit. If the product supports automatic refinement, failed feedback enters one capped retry. Otherwise the UI shows feedback to the human reviewer. Cap exhaustion returns the latest draft with `passed: false`; it is not silently relabeled successful.

### 6. Present review, not automatic action

The UI renders the draft, source markers, quoted evidence, evaluation status, warnings, and an editable response field. It distinguishes generated text from case facts. Keyboard users can open and close citation details, and status is not conveyed by color alone.

Sending the response is a separate authenticated endpoint. It accepts the reviewed text and a version/precondition for the case, not a conversational statement that the model considers approval. The send action is idempotent and audited.

### 7. Observe the whole turn

One correlation ID joins routing, optional tools, drafting, evaluation, cache behavior, and the final review result. Telemetry records stage latency, model/profile versions, usage, tool outcome, citation count, grading, retry count, and terminal status. Prompts, case contents, and policy text are excluded from ordinary logs.

This trace supports both debugging and evaluation: teams can learn which routes are expensive, which criteria fail, where citations are absent, and whether users heavily edit drafts before sending.

### Decision guide

Choose the least autonomous pattern that satisfies the product contract:

| Product need | Primary pattern | Add when needed | Avoid |
|---|---|---|---|
| A person reads one generated answer | Message | Streaming for long answers | Schema wrapping with no consumer |
| Code consumes fields or a decision | Structured output | Runtime validation and semantic evaluation | Parsing informal prose |
| Claude needs optional backend data/action | Custom tools | Tool loop, authorization, confirmation | Giving provider or browser direct privileged access |
| The useful stages are known | Fixed workflow | Routing, chaining, parallel grading, capped refinement | Open-ended agent loop |
| Grounded answers over supplied sources | Documents plus citations | Files API and prompt caching | Treating citations as correctness proof |
| Current public research | Hosted web tools | Domain/search caps and source-quality rules | Unbounded search |
| Computation or generated files | Code execution | File lifecycle, scanning, Skills | Running model-written code locally |
| Unknown sequence of environment exploration | Bounded agent | Small tools, budgets, approval, durable jobs | Agents for a known pipeline |

Several patterns can coexist, but each should keep its own contract. Structured routing does not authorize tools. Citations do not validate semantics. An evaluator does not replace human approval. An agent cap does not make unsafe tools safe.

### Composition review questions

Before implementation, ask:

1. What exact user outcome closes the turn?
2. Which steps are deterministic code, which need model judgment, and which are optional?
3. Which data is authorized, citable, cacheable, or sensitive?
4. Which failures are user-correctable, recoverable by Claude, or terminal?
5. What is provisional during streaming, and what event commits canonical state?
6. What bounds model calls, tools, time, context, cost, and side effects?
7. Which result needs human review or explicit approval?
8. How will tests script the trajectory and evaluations measure semantic quality?

A strong design can answer all eight without referring to hidden prompt behavior.

## Production Readiness Checklist

Use this checklist as a release gate. Assign an owner and evidence link for each applicable item; “not applicable” should include a reason.

### Product contract

- [ ] The user outcome, non-goals, and completion criteria are written down.
- [ ] The chosen pattern is the least autonomous one that meets the need.
- [ ] Generated, retrieved, deterministic, provisional, and user-authored data are visually distinct.
- [ ] Refusal, partial, empty, capped, cancelled, and failed outcomes have product copy and actions.
- [ ] Human review and approval boundaries are explicit for consequential outputs.

### Security and permissions

- [ ] Credentials exist only on trusted backend infrastructure and use least-privilege scopes.
- [ ] Tenant/user identity is derived from authenticated server context, never model arguments.
- [ ] Every custom and MCP tool has an allowlist, runtime validation, authorization, timeout, and output limit.
- [ ] Write actions have confirmation, idempotency, preconditions, and audit records.
- [ ] Retrieved documents, pages, images, repository content, and tool results are treated as untrusted.
- [ ] URL fetching has SSRF defenses; downloads and generated artifacts are authorized and safely served.
- [ ] Prompt, Skill, MCP, dependency, and tool-definition changes receive supply-chain review.

### Data handling and privacy

- [ ] A data-flow inventory identifies what reaches Claude, other providers, logs, caches, files, and evaluators.
- [ ] Only necessary fields and context are sent.
- [ ] Provider/platform retention and residency behavior is verified for every enabled feature.
- [ ] Upload, session, cache, transcript, trace, and artifact retention/deletion are defined.
- [ ] Logs exclude secrets and content by default; any payload capture is redacted, access-controlled, and time-limited.
- [ ] User deletion propagates to application and provider-managed files where required.
- [ ] Sensitive or regulated data has legal/security approval and appropriate user notice.

### Model and capability configuration

- [ ] Model identifiers, tool versions, beta headers, reasoning profiles, and budgets are centrally configured.
- [ ] Unsupported parameter combinations fail before the provider call.
- [ ] Prompts, schemas, tools, Skills, and model profiles are versioned in telemetry.
- [ ] Current provider documentation has been checked for model support, limits, retention, and compatibility.
- [ ] A model migration can be evaluated and rolled back independently of application deployment.

### Limits, cost, and latency

- [ ] Input size, file/page/image limits, context, output tokens, tool calls, searches, workflow attempts, and agent iterations are bounded.
- [ ] Wall-clock, concurrency, queue, and estimated-cost budgets are enforced.
- [ ] Rate-limit behavior honors provider headers and avoids retry multiplication.
- [ ] Expected and worst-case calls, tokens, tool charges, storage, and bandwidth have cost estimates.
- [ ] Time-to-first-content and completion objectives are defined by interaction type.
- [ ] Prompt caching, batching, streaming, or asynchronous jobs are used only where measurements justify them.
- [ ] Capacity tests cover representative concurrency and burst patterns.

### Resilience and failure behavior

- [ ] Validation occurs before expensive or irreversible work.
- [ ] Validation, provider, dependency, recoverable-tool, mid-stream, refusal, truncation, cap, and cancellation cases remain distinct.
- [ ] Retries are bounded, jittered, idempotent, and limited to safe operations.
- [ ] Streams have exactly one terminal completion or error and detect unexpected disconnects.
- [ ] Long jobs have durable state, cancellation, checkpoints, and recovery where needed.
- [ ] Degraded behavior exists for disabled models/tools or unavailable dependencies.
- [ ] Rollback does not corrupt conversation, workflow, or side-effect state.

### Observability and support

- [ ] One correlation ID joins frontend, backend, model calls, tools, workflows, and external clients.
- [ ] Telemetry records stop reason, usage, cache, retries, tool outcomes, caps, latency by stage, and provider request IDs.
- [ ] Dashboards separate transport health, latency, cost, and semantic quality.
- [ ] Alerts cover error/cap spikes, repeated tool calls, cost anomalies, queue growth, and quality regression.
- [ ] Support staff can inspect a redacted trace under appropriate access controls.
- [ ] Runbooks cover provider outage, rate limiting, credential failure, unsafe output, and rollback.

### Quality and evaluation

- [ ] A versioned representative evaluation set exists with difficult and adversarial slices.
- [ ] Deterministic checks, human review, and calibrated graders are used according to task risk.
- [ ] Release thresholds are declared before results are reviewed.
- [ ] Evaluations measure semantic correctness, grounding, safety, tool behavior, latency, and cost.
- [ ] Production feedback and user edits feed evaluation cases without violating privacy commitments.
- [ ] Model, prompt, schema, tool, or data changes trigger the relevant evaluation suite.

### Testing and delivery

- [ ] Unit tests cover request construction, parsing, branches, caps, and error semantics.
- [ ] Integration tests exercise real adapters with external HTTP intercepted and network disabled.
- [ ] Frontend tests cover the full interaction state machine and arbitrary stream chunking.
- [ ] Browser tests cover critical real-stack journeys in deterministic fake mode.
- [ ] No automated application test uses a real credential.
- [ ] Type checks, lint, builds, packaged assets, migrations, and production topology are verified.
- [ ] Deployment health checks do not require a billable or state-changing model call.

### Accessibility and user control

- [ ] Loading, streaming, tool activity, completion, and errors are announced without excessive screen-reader noise.
- [ ] Citations, downloads, approvals, and cancellation are keyboard accessible.
- [ ] Status does not rely on color alone, and motion respects user preferences.
- [ ] Charts and image-derived results have equivalent text or tabular representations.
- [ ] Users can identify generated content, inspect sources, correct input, retry, cancel, and report a problem.
- [ ] The interface does not imply certainty unsupported by the model or evidence.

### Rollout

- [ ] The feature can be enabled by cohort, tenant, or percentage.
- [ ] Initial limits and permissions are conservative.
- [ ] Rollback and kill switches exist for the model, each tool, and the whole feature.
- [ ] Owners monitor launch metrics and sampled outputs during the rollout window.
- [ ] Expansion criteria include quality, safety, cost, latency, and support load.
- [ ] A post-launch review records decisions and converts observed successful agent paths into workflows where appropriate.

## Conclusion

A dependable Claude feature is a normal product system with one unusual component. The model can interpret ambiguous input, generate language, choose tools, and adapt to evidence; the application still owns identity, permissions, state, contracts, limits, side effects, failure semantics, and user experience.

The durable design principles are straightforward:

1. Start with the user workflow and its completion criteria.
2. Keep the Claude boundary on the backend behind a narrow, testable adapter.
3. Prefer the least autonomous pattern that fits: message, structured output, tool, workflow, then agent.
4. Treat a user turn as a distributed operation with explicit progress and termination.
5. Preserve typed content blocks, stop reasons, usage, and complete immutable call traces.
6. Keep tool authority smaller than model flexibility, and distinguish recoverable tool errors from failed turns.
7. Bound calls, tokens, time, context, cost, and side effects before execution.
8. Test orchestration deterministically and evaluate model behavior semantically.
9. Make sources, uncertainty, partial results, and human approval visible.
10. Revisit every model- or tool-specific assumption as the platform evolves.

A sensible adoption path mirrors the chapters: ship one well-bounded message feature, add streaming only where users benefit, introduce structured output for code-owned results, expose narrow read tools, compose known stages into workflows, and reserve agents for tasks whose path remains genuinely unknowable. At each step, add the corresponding tests, evaluation cases, telemetry, and rollback control before adding more autonomy.

The best next experiment is rarely “make it more agentic.” It is usually to identify the largest remaining uncertainty—quality, data access, latency, user trust, or workflow fit—and build the smallest measured experiment that resolves it.

## References and Further Reading

The guide prioritizes official Anthropic sources for API behavior and marks volatile claims with access dates. All links below were accessed 2026-07-27.

- [Messages API reference](https://platform.claude.com/docs/en/api/messages/create) — canonical request, content, system-prompt, and stateless conversation contract.
- [Streaming Messages](https://platform.claude.com/docs/en/build-with-claude/streaming) — SSE event sequence, deltas, ping/error events, and accumulation guidance.
- [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — JSON outputs, strict tools, schema limitations, invalid-output cases, and compatibility.
- [Stop reasons and fallback](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons) — meanings and continuation behavior for completion, truncation, tool use, pause, and refusal.
- [Handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls) — client-tool lifecycle, result ordering, identifiers, and `is_error` semantics.
- [Parallel tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use) — execution choices and the required grouping of parallel results.
- [Server tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools) — hosted execution, mixed client/server turns, continuation, and domain controls.
- [Files API](https://platform.claude.com/docs/en/build-with-claude/files) — file upload, reuse, container inputs, generated-file download, deletion, and retention considerations.
- [PDF support](https://platform.claude.com/docs/en/build-with-claude/pdf-support) — supported PDF delivery, limits, visual processing, and optimization guidance.
- [Citations](https://platform.claude.com/docs/en/build-with-claude/citations) — citable document types, location formats, token behavior, and feature compatibility.
- [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — cache boundaries, TTLs, eligibility, invalidation, and usage reporting.
- [Code execution](https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool) — sandbox execution, uploaded inputs, result blocks, and generated files.
- [Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) — prebuilt and custom Skills, container attachment, and current prerequisites.
- [Web search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) — search versions, use caps, domain filtering, localization, and result errors.
- [MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector) — remote server configuration, toolsets, authorization, and MCP result behavior.
- [Vision](https://platform.claude.com/docs/en/build-with-claude/vision) — image sources, ordering, formats, limits, resizing, cost, and known limitations.
- [Extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) — model-specific thinking modes, blocks, budgets, tool-use continuity, and compatibility.
- [Effort](https://platform.claude.com/docs/en/build-with-claude/effort) — response-wide effort controls and their interaction with adaptive thinking.
- [Tool Runner](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-runner) — SDK-managed tool loops, error wrapping, iteration caps, and customization points.
- [API errors](https://platform.claude.com/docs/en/api/errors) — HTTP errors, typed SDK exceptions, retry behavior, request identifiers, and payload limits.
- [Rate limits](https://platform.claude.com/docs/en/api/rate-limits) — request/token limit semantics, `retry-after`, cache-aware accounting, and monitoring headers.
- [Building Effective AI Agents](https://www.anthropic.com/engineering/building-effective-agents) — architectural distinction between workflows and agents and guidance on composing simple patterns.

Model names, tool versions, limits, availability, beta headers, pricing, and retention can change. Recheck the relevant linked page during implementation and again before publication or release.

## Appendices

### Appendix A: Portable Request and Response Examples

Use these shapes as contract examples, not copy-paste production configuration. Select a current model and confirm supported parameters in the official documentation.

```json
{
  "model": "<configured-model-id>",
  "max_tokens": 512,
  "system": "Answer from the supplied context. State when evidence is insufficient.",
  "messages": [{ "role": "user", "content": "Summarize the refund policy." }]
}
```

Preserve the response as typed content blocks plus metadata rather than flattening it immediately:

```json
{
  "id": "msg_...",
  "content": [{ "type": "text", "text": "..." }],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 120, "output_tokens": 44 }
}
```

For structured output, define the schema at the API boundary and validate the parsed value again before domain use. For client tools, return every `tool_result` with the matching `tool_use_id` in the next user message; group parallel results together.

### Appendix B: Error Taxonomy

| Error class | Detect at | Retry? | Public behavior |
|---|---|---:|---|
| Request validation | Backend boundary | No | Field-level correction |
| Authentication/authorization | Backend and tool runtime | No | Reauthenticate or deny safely |
| Provider rate limit/overload | API adapter | Yes, bounded | Preserve input; show delayed/retry state |
| Recoverable tool result | Orchestrator | Model may adapt | Continue with visible degraded status |
| Tool transport/runtime failure | Tool adapter | Only if safe | Fail or offer retry without duplicating effects |
| Refusal | Stop reason/content | No automatic retry | Explain limitation and safe alternatives |
| Output/context cap | Stop reason/budget | Only with explicit continuation policy | Mark partial result |
| Stream interruption | Stream accumulator | Conditional | Retain confirmed content; expose retry |
| Evaluation failure | Release/runtime quality gate | No blind retry | Quarantine, review, or fall back |

### Appendix C: Testing Matrix

| Capability | Unit | Integration | Frontend/browser | Evaluation |
|---|---|---|---|---|
| Messages | Request builder, parser | Adapter and error mapping | Submit/loading/result/error | Helpfulness and correctness |
| Streaming | Event reducer, terminal rules | Arbitrary chunk boundaries | Cancel, reconnect, partial output | Final-output parity |
| Structured output | Schema and domain validation | Invalid/refusal/capped cases | Render validation states | Field-level accuracy |
| Client tools | Argument validation, loop caps | Tool-result round trips | Tool activity and approval | Tool choice and argument quality |
| Workflows | Branch and state transitions | Checkpoint/recovery | Durable progress and retry | End-to-end task completion |
| Agents | Budgets, permissions, termination | Multi-step trace replay | Inspect/cancel/approve | Success, safety, cost, and path quality |

### Appendix D: Capability Comparison

| Pattern | Who controls the next step? | Typical calls | Best fit | Principal risk |
|---|---|---:|---|---|
| Message | Application/user | 1 | Drafting, Q&A, transformation | Treating prose as a contract |
| Structured output | Application | 1 | Typed extraction and decisions | Schema-valid but wrong values |
| Client tool loop | Model within app policy | 2+ | Dynamic access to private actions/data | Excess authority or unbounded loops |
| Server tool | Model/provider within configuration | 1+ | Hosted search or execution | Provider-side cost and data exposure |
| Workflow | Application state machine | Fixed/bounded | Known multi-stage business process | Hidden branch and recovery complexity |
| Agent | Model within strict budgets | Variable | Open-ended tasks with unknown paths | Unpredictable actions, cost, and latency |

## Topical Index

- [Agents](#chapter-9-agents)
- [API errors](#chapter-12-production-hardening)
- [Application contracts](#chapter-2-application-architecture-and-boundaries)
- [Authorization](#chapter-10-security-privacy-and-data-governance)
- [Citations](#chapter-6-documents-files-images-and-citations)
- [Code execution](#chapter-7-hosted-tools-and-agent-skills)
- [Content blocks](#chapter-3-messages-api-fundamentals)
- [Error taxonomy](#appendix-b-error-taxonomy)
- [Evaluations](#chapter-13-testing-and-evaluation)
- [Files and documents](#chapter-6-documents-files-images-and-citations)
- [Hosted tools and Skills](#chapter-7-hosted-tools-and-agent-skills)
- [MCP](#chapter-8-mcp-and-remote-tool-integration)
- [Messages](#chapter-3-messages-api-fundamentals)
- [Observability](#chapter-11-observability-cost-and-performance)
- [Prompt caching](#chapter-11-observability-cost-and-performance)
- [Refusals and stop reasons](#chapter-3-messages-api-fundamentals)
- [Streaming](#chapter-4-streaming-and-real-time-ux)
- [Structured outputs](#chapter-5-structured-outputs-and-client-tools)
- [Testing matrix](#appendix-c-testing-matrix)
- [Thinking and effort](#chapter-3-messages-api-fundamentals)
- [Tool use](#chapter-5-structured-outputs-and-client-tools)
- [Vision](#chapter-6-documents-files-images-and-citations)
- [Workflows](#chapter-9-agents)
