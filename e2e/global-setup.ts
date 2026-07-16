/** Aborts the whole suite before any spec runs if the dev stack isn't in fake mode — see docs/planning/task-frontend-browser-e2e-tests.md. */
export default async function globalSetup(): Promise<void> {
  const response = await fetch('http://backend:3000/api/mode');
  const { fakeMode } = (await response.json()) as { fakeMode: boolean };
  if (fakeMode !== true) {
    throw new Error(
      'Refusing to run browser E2E tests: FAKE_MODE is not enabled on the running dev stack.',
    );
  }
}
