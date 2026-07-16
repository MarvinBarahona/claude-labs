---
name: angular-conventions
description: This skill should be used when writing or editing any Angular code in this repo's `frontend/` app — for example when asked to "add a component", "build the inspector panel", "build the docs panel", or any other frontend implementation task. Covers general, up-to-date Angular coding conventions (component style, state management, control-flow syntax, DI) applicable to any Angular codebase; not this project's architecture decisions (see `tech-stack.md`, indexed from `technical.md`).
---

# Angular coding conventions

General best practices for writing modern Angular code, independent of any one project's specifics.

## Stay project-agnostic

Never reference another skill by name here, project-specific or otherwise — this skill should read the same in any repo it's dropped into. A skill checked into a given project besides that project's own listed skills is generic tooling that can be renamed, replaced, or deleted independently of the project — this skill included — so a hard-coded reference to one would go stale silently.

## Components

- **Standalone by default** — no `NgModule`s. Every component, directive, and pipe declares its own `imports`.
- **`inject()` over constructor injection** for services, tokens, and framework APIs (`inject(Router)`, `inject(DestroyRef)`) — keeps constructors free of boilerplate and works in field initializers.
- **`OnPush` change detection** on every component. Combined with signals, this is close to the default expectation of the framework, not an opt-in optimization.
- **Signal-based inputs/outputs/model** — `input()`, `input.required()`, `output()`, and `model()` instead of `@Input()`/`@Output()` decorators. Use `model()` for two-way-bindable state instead of hand-rolled `@Input()` + `@Output()` pairs.
- Prefer the `host` metadata property over `@HostBinding`/`@HostListener` decorators for host bindings and listeners.

## State and reactivity

- **Signals** (`signal`, `computed`, `effect`) for component and service state — not `BehaviorSubject`/manual RxJS state management.
- Use `toSignal()` / `toObservable()` at the RxJS/signal boundary (e.g. wrapping an `HttpClient` call or a router event stream) rather than mixing subscription-based state with signals ad hoc.
- Keep `effect()` usage narrow — for synchronizing with non-Angular APIs (DOM, third-party libs, logging), not for deriving state that `computed()` should own.
- RxJS is still the right tool for genuine event streams (debounced search input, WebSocket messages, complex async orchestration) — don't force those into signals.

## Templates

- **Built-in control-flow syntax** — `@if`/`@for`/`@switch`, not the structural directives (`*ngIf`/`*ngFor`/`*ngSwitch`).
- Always give `@for` a `track` expression (track by id, not index, unless the list is truly static).
- Use `@let` for template-local derived values instead of repeating an expression or reaching for a getter.
- Prefer the native template syntax for deferred loading (`@defer`) over manual lazy-loading hacks for below-the-fold or heavy components.

## Forms

- **Typed reactive forms** (`FormGroup<T>`, `FormControl<T>`) — avoid untyped/dynamic form models.
- Keep validation logic in validators (built-in or custom `ValidatorFn`s), not scattered in template conditionals or component methods.

## Routing and code splitting

- Lazy-load at the route level: `loadComponent` for standalone components, `loadChildren` for route groups — not eagerly-imported feature modules.
- Use functional guards/resolvers (`CanActivateFn`, `ResolveFn`) over class-based guards.

## Project structure and naming

- Follow the Angular CLI conventions and generated project structure for the installed Angular version — file naming, folder layout, and schematic defaults change across major versions, so match whatever `ng generate` produces for the version actually in use rather than an older convention from memory.
- Keep components focused: a component that's accumulating unrelated responsibilities should be split, not grown.
- Keep a comment to one short line — a longer WHY (a design rationale, a workaround, a decision worth preserving) belongs in the relevant doc, not a multi-line comment block in the source.

## Testing

- Use `TestBed` with standalone component test setups (`imports: [MyComponent]`), not `declarations`.
- Prefer component harnesses (Angular CDK `ComponentHarness`) over querying DOM structure directly when testing componentized UI.
