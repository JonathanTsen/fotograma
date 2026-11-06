import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  timeout: 300_000,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results'
})
