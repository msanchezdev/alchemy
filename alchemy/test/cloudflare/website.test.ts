import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { Website } from "../../src/cloudflare/website.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Website Resource", () => {
  test("respects cwd property for wrangler.jsonc placement", async (scope) => {
    const name = `${BRANCH_PREFIX}-test-website-cwd`;
    const tempDir = path.resolve(".out", "alchemy-website-cwd-test");
    const subDir = path.resolve(tempDir, "subproject");
    const distDir = path.resolve(subDir, "dist");
    const entrypoint = path.resolve(subDir, "worker.ts");

    try {
      // Create temporary directory structure
      await fs.rm(tempDir, { recursive: true, force: true });
      await fs.mkdir(subDir, { recursive: true });
      await fs.mkdir(distDir, { recursive: true });

      // Create a simple index.html in the dist directory
      await fs.writeFile(
        path.join(distDir, "index.html"),
        "<html><body>Hello Website!</body></html>",
      );

      // Create a simple worker entrypoint
      await fs.writeFile(
        entrypoint,
        `export default {
          async fetch(request, env) {
            return new Response("Hello from worker!");
          }
        };`,
      );

      // Create website with cwd pointing to subdirectory
      const website = await Website(name, {
        cwd: subDir,
        main: entrypoint,
        assets: distDir, // Use absolute path for assets
        wrangler: true,
        adopt: true,
      });

      // Verify the website was created successfully
      expect(website.name).toBe(name);
      expect(website.url).toBeDefined();

      // Verify wrangler.jsonc was created in the correct location (subDir)
      const wranglerPath = path.join(subDir, "wrangler.jsonc");
      const wranglerExists = await fs
        .access(wranglerPath)
        .then(() => true)
        .catch(() => false);

      expect(wranglerExists).toBe(true);

      // Verify wrangler.jsonc was NOT created in the root tempDir
      const rootWranglerPath = path.join(tempDir, "wrangler.jsonc");
      const rootWranglerExists = await fs
        .access(rootWranglerPath)
        .then(() => true)
        .catch(() => false);

      expect(rootWranglerExists).toBe(false);

      // Verify the contents of wrangler.jsonc
      const wranglerContent = await fs.readFile(wranglerPath, "utf-8");
      const wranglerJson = JSON.parse(wranglerContent);

      expect(wranglerJson.name).toBe(name);
      expect(wranglerJson.assets).toMatchObject({
        binding: "ASSETS",
        directory: expect.stringContaining("dist"),
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
      await destroy(scope);
    }
  });

  test("respects cwd property with custom wrangler path", async (scope) => {
    const name = `${BRANCH_PREFIX}-test-website-cwd-custom`;
    const tempDir = path.resolve(".out", "alchemy-website-cwd-custom-test");
    const subDir = path.join(tempDir, "myproject");
    const distDir = path.join(subDir, "dist");
    const entrypoint = path.join(subDir, "worker.ts");

    try {
      // Create temporary directory structure
      await fs.rm(tempDir, { recursive: true, force: true });
      await fs.mkdir(subDir, { recursive: true });
      await fs.mkdir(distDir, { recursive: true });

      // Create a simple index.html in the dist directory
      await fs.writeFile(
        path.join(distDir, "index.html"),
        "<html><body>Hello Custom Website!</body></html>",
      );

      // Create a simple worker entrypoint
      await fs.writeFile(
        entrypoint,
        `export default {
          async fetch(request, env) {
            return new Response("Hello from custom worker!");
          }
        };`,
      );

      // Create website with cwd and custom wrangler filename
      const website = await Website(name, {
        cwd: subDir,
        main: entrypoint,
        assets: path.resolve(distDir), // Use absolute path for assets
        wrangler: "custom-wrangler.json",
        adopt: true,
      });

      // Verify the website was created successfully
      expect(website.name).toBe(name);

      // Verify custom wrangler file was created in the correct location (subDir)
      const wranglerPath = path.join(subDir, "custom-wrangler.json");
      const wranglerExists = await fs
        .access(wranglerPath)
        .then(() => true)
        .catch(() => false);

      expect(wranglerExists).toBe(true);

      // Verify custom wrangler file was NOT created in the root tempDir
      const rootWranglerPath = path.join(tempDir, "custom-wrangler.json");
      const rootWranglerExists = await fs
        .access(rootWranglerPath)
        .then(() => true)
        .catch(() => false);

      expect(rootWranglerExists).toBe(false);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
      await destroy(scope);
    }
  });

  test("places wrangler.jsonc in project root when no cwd specified", async (scope) => {
    const name = `${BRANCH_PREFIX}-test-website-default-cwd`;
    const tempDir = path.join(".out", "alchemy-website-default-test");
    const distDir = path.join(tempDir, "dist");
    const entrypoint = path.join(tempDir, "worker.ts");

    try {
      // Create temporary directory structure
      await fs.rm(tempDir, { recursive: true, force: true });
      await fs.mkdir(distDir, { recursive: true });

      // Create a simple index.html in the dist directory
      await fs.writeFile(
        path.join(distDir, "index.html"),
        "<html><body>Hello Default Website!</body></html>",
      );

      // Create a simple worker entrypoint
      await fs.writeFile(
        entrypoint,
        `export default {
          async fetch(request, env) {
            return new Response("Hello from default worker!");
          }
        };`,
      );

      // Create website without specifying cwd (should use process.cwd())
      const website = await Website(name, {
        main: entrypoint,
        assets: path.join(tempDir, "dist"), // Use absolute path since no cwd specified
        wrangler: true,
        adopt: true,
      });

      // Verify the website was created successfully
      expect(website.name).toBe(name);

      // Verify wrangler.jsonc was created in the current working directory (project root)
      // Since we didn't specify cwd, it should be placed relative to process.cwd()
      const wranglerPath = path.join(process.cwd(), "wrangler.jsonc");
      const wranglerExists = await fs
        .access(wranglerPath)
        .then(() => true)
        .catch(() => false);

      expect(wranglerExists).toBe(true);

      // Clean up the wrangler.jsonc file in the project root
      if (wranglerExists) {
        await fs.rm(wranglerPath, { force: true });
      }
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
      await destroy(scope);
    }
  });
});
