import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// The vitest config does not set `globals: true`, so @testing-library/react does
// not auto-register its cleanup. Do it once here for the whole suite; without it,
// renders accumulate in document.body across tests and queries match duplicates.
afterEach(() => {
  cleanup();
});
