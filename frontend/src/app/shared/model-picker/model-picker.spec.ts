import { TestBed } from '@angular/core/testing';
import { ModelPicker } from './model-picker';
import type { ModelChoice } from './model-picker';

describe('ModelPicker', () => {
  async function createFixture(value: ModelChoice) {
    await TestBed.configureTestingModule({ imports: [ModelPicker] }).compileComponents();
    const fixture = TestBed.createComponent(ModelPicker);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    return fixture;
  }

  it('renders all 3 options, labeled Sonnet/Haiku/Opus, in that order', async () => {
    const fixture = await createFixture('default');

    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('label'),
    ).map((label) => label.textContent?.trim());
    expect(labels).toEqual(['Sonnet', 'Haiku', 'Opus']);
  });

  it('emits valueChange with the corresponding ModelChoice when an option is selected', async () => {
    const fixture = await createFixture('default');
    const emitted: ModelChoice[] = [];
    fixture.componentInstance.valueChange.subscribe((value: ModelChoice) => emitted.push(value));

    const inputs = (fixture.nativeElement as HTMLElement).querySelectorAll('input[type="radio"]');
    (inputs[2] as HTMLInputElement).dispatchEvent(new Event('change'));

    expect(emitted).toEqual(['hardest-call']);
  });

  it('reflects the current value input, including when it changes externally after mount', async () => {
    const fixture = await createFixture('default');

    let inputs = (fixture.nativeElement as HTMLElement).querySelectorAll('input[type="radio"]');
    expect((inputs[0] as HTMLInputElement).checked).toBe(true);
    expect((inputs[1] as HTMLInputElement).checked).toBe(false);

    fixture.componentRef.setInput('value', 'classification');
    fixture.detectChanges();

    inputs = (fixture.nativeElement as HTMLElement).querySelectorAll('input[type="radio"]');
    expect((inputs[0] as HTMLInputElement).checked).toBe(false);
    expect((inputs[1] as HTMLInputElement).checked).toBe(true);
  });
});
