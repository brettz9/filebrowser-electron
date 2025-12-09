import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: '.',
  workers: 1, // Run tests sequentially to avoid conflicts
  fullyParallel: false
});
