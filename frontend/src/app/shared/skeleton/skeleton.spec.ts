import { TestBed } from '@angular/core/testing';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  async function createFixture() {
    await TestBed.configureTestingModule({ imports: [Skeleton] }).compileComponents();
    const fixture = TestBed.createComponent(Skeleton);
    fixture.detectChanges();
    return fixture;
  }

  it('renders with default width, height and border-radius', async () => {
    const fixture = await createFixture();

    const el = fixture.nativeElement.querySelector('div') as HTMLElement;
    expect(el.classList.contains('w-full')).toBe(true);
    expect(el.style.height).toBe('16px');
    expect(el.style.borderRadius).toBe('4px');
  });

  it('applies a custom width class, height and border-radius', async () => {
    const fixture = await createFixture();
    fixture.componentRef.setInput('widthClass', 'w-1/3');
    fixture.componentRef.setInput('heightPx', 24);
    fixture.componentRef.setInput('borderRadiusPx', 8);
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('div') as HTMLElement;
    expect(el.classList.contains('w-1/3')).toBe(true);
    expect(el.style.height).toBe('24px');
    expect(el.style.borderRadius).toBe('8px');
  });
});
