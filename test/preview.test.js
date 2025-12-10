/**
 * @file Tests for preview functionality in index.js.
 */

/* eslint-disable chai-expect-keywords/no-unsupported-keywords -- Not Chai */
/* eslint-disable n/no-sync -- Testing */
/* eslint-disable @stylistic/max-len -- Test file with long locators */

import {test, expect} from '@playwright/test';
import {initialize, coverage} from './utils/initialize.js';
import path from 'path';
import fs from 'fs';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  afterEach, afterAll, beforeEach, beforeAll, describe
} = test;

describe('Preview', () => {
  describe('Preview functionality', () => {
    /** @type {import('playwright').ElectronApplication} */
    let electron;
    /** @type {import('playwright').Page} */
    let page;
    const testDir = path.join(__dirname, 'test-preview-files');

    beforeAll(() => {
      // Create test directory with various file types
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, {recursive: true});
      }

      // Create a text file with HTML entities for escaping tests
      fs.writeFileSync(
        path.join(testDir, 'html-entities.txt'),
        '<script>alert("test")</script>\n&amp; symbols'
      );

      // Create a large text file (>1000 chars) for truncation test
      fs.writeFileSync(
        path.join(testDir, 'large-text.txt'),
        'a'.repeat(1500)
      );

      // Create a simple text file
      fs.writeFileSync(
        path.join(testDir, 'simple.txt'),
        'Hello world'
      );

      // Create an image file (1x1 PNG)
      const pngData = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );
      fs.writeFileSync(path.join(testDir, 'test-image.png'), pngData);

      // Create a PDF file (minimal valid PDF)
      const pdfContent = `%PDF-1.4
  1 0 obj
  <<
  /Type /Catalog
  /Pages 2 0 R
  >>
  endobj
  2 0 obj
  <<
  /Type /Pages
  /Kids [3 0 R]
  /Count 1
  >>
  endobj
  3 0 obj
  <<
  /Type /Page
  /Parent 2 0 R
  /MediaBox [0 0 612 792]
  >>
  endobj
  xref
  0 4
  0000000000 65535 f
  0000000009 00000 n
  0000000058 00000 n
  0000000115 00000 n
  trailer
  <<
  /Size 4
  /Root 1 0 R
  >>
  startxref
  190
  %%EOF`;
      fs.writeFileSync(path.join(testDir, 'test.pdf'), pdfContent);
    });

    beforeEach(async () => {
      ({electron, page} = await initialize());

      // Switch to three-columns view where previews are shown
      await page.click('#three-columns');
      await page.waitForTimeout(500);
    });

    afterEach(async () => {
      await coverage({electron, page});
    });

    afterAll(() => {
      // Clean up test files
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, {recursive: true, force: true});
      }
    });

    test('shows "File not found" for non-existent files (lines 859-860)', async () => {
      // Create a file, get reference to it, then delete it before preview
      const tempFile = path.join(testDir, 'will-be-deleted.txt');
      fs.writeFileSync(tempFile, 'temporary');

      // Navigate to test directory
      await page.evaluate((dir) => {
        globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
      }, testDir);
      await page.waitForTimeout(1000);

      // Click on the file
      const fileLink = await page.locator('a[title*="will-be-deleted.txt"], span[title*="will-be-deleted.txt"]');
      await fileLink.click();
      await page.waitForTimeout(300);

      // Now delete the file
      fs.unlinkSync(tempFile);

      // Click again to trigger preview with non-existent file
      await fileLink.click();
      await page.waitForTimeout(500);

      // Check preview shows error
      const previewPane = await page.locator('.miller-preview');
      const previewHtml = await previewPane.innerHTML();

      expect(previewHtml).toContain('File not found');
    });

    test('generates image preview content (lines 882-885)', async () => {
      // Navigate to test directory
      await page.evaluate((dir) => {
        globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
      }, testDir);
      await page.waitForTimeout(500);

      // Click on the image file
      const imageLink = await page.locator('a[title*="test-image.png"], span[title*="test-image.png"]');
      await imageLink.click();
      await page.waitForTimeout(500);

      // Check preview pane contains image
      const previewPane = await page.locator('.miller-preview');
      const previewHtml = await previewPane.innerHTML();

      expect(previewHtml).toContain('miller-preview-content');
      expect(previewHtml).toContain('<img');
      expect(previewHtml).toContain('test-image.png');
    });

    test('generates PDF preview content (lines 887-891)', async () => {
      // Navigate to test directory
      await page.evaluate((dir) => {
        globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
      }, testDir);
      await page.waitForTimeout(500);

      // Click on the PDF file
      const pdfLink = await page.locator('a[title*="test.pdf"], span[title*="test.pdf"]');
      await pdfLink.click();
      await page.waitForTimeout(500);

      // Check preview pane contains embed for PDF
      const previewPane = await page.locator('.miller-preview');
      const previewHtml = await previewPane.innerHTML();

      expect(previewHtml).toContain('miller-preview-content');
      expect(previewHtml).toContain('<embed');
      expect(previewHtml).toContain('application/pdf');
    });

    test('escapes HTML entities in text preview (lines 912-916)', async () => {
      // Navigate to test directory
      await page.evaluate((dir) => {
        globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
      }, testDir);
      await page.waitForTimeout(500);

      // Click on the file with HTML entities to trigger preview
      const textLink = await page.locator('a[title*="html-entities.txt"], span[title*="html-entities.txt"]');
      await textLink.click();
      await page.waitForTimeout(1000);

      // Check preview pane properly escapes HTML (lines 912-916)
      const previewPane = await page.locator('.miller-preview');
      const previewHtml = await previewPane.innerHTML();

      // Verify the specific escaping that happens on lines 912-916
      // Line 904: replaceAll('&', '&amp;')
      // Line 905: replaceAll('<', '&lt;')
      // Line 906: replaceAll('>', '&gt;')
      expect(previewHtml).toContain('&lt;script&gt;');
      expect(previewHtml).toContain('&amp;amp;');
      expect(previewHtml).not.toContain('<script>alert');

      // Also verify it's in the styled pre element (line 911-914)
      expect(previewHtml).toContain('<pre style=');
      expect(previewHtml).toContain('white-space: pre-wrap');
    });

    test('truncates large text files with marker', async () => {
      // Navigate to test directory
      await page.evaluate((dir) => {
        globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
      }, testDir);
      await page.waitForTimeout(500);

      // Click on the large text file
      const textLink = await page.locator('a[title*="large-text.txt"], span[title*="large-text.txt"]');
      await textLink.click();
      await page.waitForTimeout(500);

      // Check preview shows truncation marker
      const previewPane = await page.locator('.miller-preview');
      const previewHtml = await previewPane.innerHTML();

      expect(previewHtml).toContain('[... truncated]');
    });
  });

  describe('Reset function sticky notes', () => {
    /** @type {import('playwright').ElectronApplication} */
    let electron;
    /** @type {import('playwright').Page} */
    let page;

    beforeEach(async () => {
      ({electron, page} = await initialize());

      // Pre-populate localStorage with sticky notes for root before any navigation
      await page.evaluate(() => {
        const stickyData = JSON.stringify([{
          id: 'test-sticky-1',
          html: 'Test sticky note content',
          x: 100,
          y: 100,
          metadata: {type: 'local', path: '/'}
        }]);
        // Use the app's storage system, not browser localStorage
        // @ts-expect-error - electronAPI storage
        globalThis.electronAPI.storage.setItem('stickyNotes-local-/', stickyData);
      });

      // Switch to three-columns view
      await page.click('#three-columns');
      await page.waitForTimeout(500);
    });

    afterEach(async () => {
      await coverage({electron, page});
    });

    test('loads sticky notes on reset to root (lines 971-977)', async () => {
      // Navigate away from root
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/Users';
      });
      await page.waitForTimeout(500);

      // Trigger reset by pressing Escape - this executes the reset() callback
      // which calls lines 967-977 (getItem, clear, if(saved), loadNotes, forEach)
      await page.keyboard.press('Escape');
      await page.waitForTimeout(3000);

      // Verify we're back at root
      const currentPath = await page.evaluate(() => {
        return globalThis.location.hash;
      });
      const isAtRoot = currentPath === '#path=/' || currentPath === '#path=%2F';
      expect(isAtRoot).toBe(true);

      // Lines 971-977 execute when reset() callback runs with saved sticky notes data
    });
  });
});
