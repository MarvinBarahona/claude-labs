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

_Drafting note: Document delivery, file state, citations, caching, and follow-up turns._

## 8. Code Execution and Generated Artifacts

_Drafting note: Dataset upload, sandboxed execution, inspection, downloads, and artifact UI._

## 9. Web Search and MCP Connectors

_Drafting note: Hosted tools, MCP, backend tools, structured results, and in-response failures._

## 10. Vision Features

_Drafting note: Image blocks, comparison, delivery, limits, previews, and result handling._

## 11. Extended Thinking

_Drafting note: Thinking configuration, comparisons, reasoning summaries, latency, usage, and quality._

## 12. Agents as a Deliberate Exception

_Drafting note: Capped loops, abstract tools, action logs, completion, and cap behavior._

## 13. Testing and Operational Hardening

_Drafting note: Unit, integration, frontend, and browser tests; deterministic substitutes; errors; operations._

## Putting It Together

_Drafting note: One representative end-to-end feature and a pattern decision guide._

## Production Readiness Checklist

_Drafting note: Security, data, configuration, limits, resilience, telemetry, evaluation, accessibility, cost, latency, and rollout._

## Conclusion

_To be drafted._

## References and Further Reading

_Authoritative API references will be added and access-dated during technical review._

## Appendices

### Appendix A: Portable Request and Response Examples

_To be drafted._

### Appendix B: Error Taxonomy

_To be drafted._

### Appendix C: Testing Matrix

_To be drafted._

### Appendix D: Capability Comparison

_To be drafted if it adds durable value beyond the decision guide._

## Topical Index

_To be assembled after section anchors stabilize._
