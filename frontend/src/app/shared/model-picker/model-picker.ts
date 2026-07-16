import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** The model picker's 3 options — union order is also the labeled display order (Sonnet/Haiku/Opus). */
export type ModelChoice = 'default' | 'classification' | 'hardest-call';

export const MODEL_OPTIONS: readonly { value: ModelChoice; label: string }[] = [
  { value: 'default', label: 'Sonnet' },
  { value: 'classification', label: 'Haiku' },
  { value: 'hardest-call', label: 'Opus' },
];

@Component({
  selector: 'app-model-picker',
  templateUrl: './model-picker.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelPicker {
  readonly value = input.required<ModelChoice>();
  readonly valueChange = output<ModelChoice>();

  protected readonly modelOptions = MODEL_OPTIONS;

  protected onChange(value: ModelChoice): void {
    this.valueChange.emit(value);
  }
}
