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

_Drafting note: Messages, system prompts, model configuration, streaming, and terminal errors._

## 4. Structured Outputs

_Drafting note: Schema constraints, parsing, validation, rendering, and malformed responses._

## 5. Custom Backend Tools

_Drafting note: Tool definitions, immutable loops, failed tool results, traces, and activity events._

## 6. Workflows Before Agents

_Drafting note: Routing, chaining, parallelization, evaluator-optimizer, caps, and observability._

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
