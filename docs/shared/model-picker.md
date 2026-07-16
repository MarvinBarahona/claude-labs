# Model Picker

A small shared frontend component wrapping the 3-tier model selector (Sonnet/Haiku/Opus, backed by `ModelTier`'s `'default' | 'classification' | 'hardest-call'`). Every lab that calls the Claude API uses this component instead of redeclaring its own picker markup.

## Interface

`ModelPicker` (`frontend/src/app/shared/model-picker/model-picker.ts`, selector `app-model-picker`, template `model-picker.html`):

- `value = input.required<ModelChoice>()` / `valueChange = output<ModelChoice>()` — matches this app's existing non-`model()`-signal component style (`InspectorPanel`/`DocsPanel` both use `input`/`input.required`, not Angular's two-way `model()` API).
- Renders the 3 fixed options, labeled Sonnet/Haiku/Opus in that display order, as a radio group (`name="model-choice"`).
- This file also exports the `ModelChoice` type (`'default' | 'classification' | 'hardest-call'`) and the `MODEL_OPTIONS` constant (`readonly { value: ModelChoice; label: string }[]`) itself, so a consuming lab imports both the type and the component from one place instead of redeclaring the union itself.

## Using it

Import `ModelPicker` into a lab component's `imports` array and bind `[value]`/`(valueChange)` to a `ModelChoice` signal:

```html
<app-model-picker [value]="modelChoice()" (valueChange)="onModelChoiceChange($event)" />
```

Send the resulting `ModelChoice` value straight through to the backend request body — it resolves to a real model ID server-side via `ModelConfigService.getModel(choice)` (see `model-config.md`), never client-side.

## Testing

- `frontend/src/app/shared/model-picker/model-picker.spec.ts` — covers rendering all 3 options in Sonnet/Haiku/Opus order, `valueChange` emitting the selected `ModelChoice`, and the rendered selection reflecting the `value` input including external changes after mount.
