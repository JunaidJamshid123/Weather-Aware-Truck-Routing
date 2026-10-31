import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';

import { resetUiStore } from '../store/uiStore';
import { server } from './server';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetUiStore();
});
afterAll(() => {
  server.close();
});

// jsdom lacks WebGL and Blob URLs; components only use MapLibre directly for markers.
vi.mock('maplibre-gl', () => ({
  Marker: class {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {
      return this;
    }
  },
}));
