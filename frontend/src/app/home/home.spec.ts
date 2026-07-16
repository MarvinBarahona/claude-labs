import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Home } from './home';
import { FEATURE_ROUTES } from '../core/feature-registry';
import { LAB_CATALOG } from '../core/lab-catalog';

describe('Home', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the fixed intro prose', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('hands-on companion');
  });

  it('renders one lab-index entry per FEATURE_ROUTES entry excluding home, in array order', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();

    const expectedSlugs = FEATURE_ROUTES.filter((feature) => feature.slug !== 'home').map(
      (feature) => feature.slug,
    );
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="lab-index"] a'),
    ) as HTMLAnchorElement[];

    expect(links).toHaveLength(expectedSlugs.length);
    links.forEach((link, i) => {
      expect(link.getAttribute('href')).toBe(`/${expectedSlugs[i]}`);
    });
  });

  it("displays each lab's goal and concepts from LAB_CATALOG", () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    for (const feature of FEATURE_ROUTES.filter((f) => f.slug !== 'home')) {
      const entry = LAB_CATALOG[feature.slug];
      expect(text).toContain(entry.goal);
      for (const concept of entry.concepts) {
        expect(text).toContain(concept);
      }
    }
  });
});
