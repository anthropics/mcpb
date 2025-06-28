import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  getAllFiles,
  readDxtIgnorePatterns,
  shouldExclude,
} from "../src/node/files.js";

describe("DxtIgnore functionality", () => {
  let tempDir: string;
  let dxtIgnorePath: string;

  beforeEach(() => {
    // Create a temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dxt-test-"));
    dxtIgnorePath = path.join(tempDir, ".dxtignore");
  });

  afterEach(() => {
    // Clean up temp directory after each test
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("readDxtIgnorePatterns", () => {
    it("should return empty array when .dxtignore doesn't exist", () => {
      const patterns = readDxtIgnorePatterns(tempDir);
      expect(patterns).toEqual([]);
    });

    it("should read patterns from .dxtignore file", () => {
      const content = `*.log
node_modules/
temp/
.env`;
      fs.writeFileSync(dxtIgnorePath, content);

      const patterns = readDxtIgnorePatterns(tempDir);
      expect(patterns).toEqual(["*.log", "node_modules/", "temp/", ".env"]);
    });

    it("should ignore empty lines and comments", () => {
      const content = `# Comment line
*.log

# Another comment
node_modules/

.env`;
      fs.writeFileSync(dxtIgnorePath, content);

      const patterns = readDxtIgnorePatterns(tempDir);
      expect(patterns).toEqual(["*.log", "node_modules/", ".env"]);
    });

    it("should trim whitespace from lines", () => {
      const content = `  *.log  
   node_modules/   
temp/`;
      fs.writeFileSync(dxtIgnorePath, content);

      const patterns = readDxtIgnorePatterns(tempDir);
      expect(patterns).toEqual(["*.log", "node_modules/", "temp/"]);
    });

    it("should handle Windows line endings", () => {
      const content = `*.log\r\nnode_modules/\r\ntemp/`;
      fs.writeFileSync(dxtIgnorePath, content);

      const patterns = readDxtIgnorePatterns(tempDir);
      expect(patterns).toEqual(["*.log", "node_modules/", "temp/"]);
    });

    it("should return empty array if file cannot be read", () => {
      const content = "*.log";
      fs.writeFileSync(dxtIgnorePath, content);
      fs.chmodSync(dxtIgnorePath, 0); // Make file unreadable

      const patterns = readDxtIgnorePatterns(tempDir);
      expect(patterns).toEqual([]);

      // Restore permissions for cleanup
      fs.chmodSync(dxtIgnorePath, 0o644);
    });
  });

  describe("shouldExclude with additional patterns", () => {
    it("should exclude files matching additional patterns", () => {
      const additionalPatterns = ["*.test.js", "coverage/"];

      expect(shouldExclude("test.test.js", additionalPatterns)).toBe(true);
      expect(shouldExclude("coverage/file.txt", additionalPatterns)).toBe(true);
      expect(shouldExclude("src/index.js", additionalPatterns)).toBe(false);
    });

    it("should still exclude default patterns", () => {
      const additionalPatterns = ["*.test.js"];

      // Test default pattern
      expect(shouldExclude(".DS_Store", additionalPatterns)).toBe(true);
      // Test additional pattern
      expect(shouldExclude("test.test.js", additionalPatterns)).toBe(true);
      // Test non-excluded file
      expect(shouldExclude("src/index.js", additionalPatterns)).toBe(false);
    });

    it("should handle glob patterns correctly", () => {
      const additionalPatterns = ["*.log", "temp/*"];

      expect(shouldExclude("debug.log", additionalPatterns)).toBe(true);
      expect(shouldExclude("temp/file.txt", additionalPatterns)).toBe(true);
      expect(shouldExclude("src/main.js", additionalPatterns)).toBe(false);
    });

    it("should handle exact path matches", () => {
      const additionalPatterns = ["node_modules", "dist"];

      expect(shouldExclude("node_modules", additionalPatterns)).toBe(true);
      expect(shouldExclude("dist", additionalPatterns)).toBe(true);
      expect(shouldExclude("src/node_modules", additionalPatterns)).toBe(true);
      expect(shouldExclude("src", additionalPatterns)).toBe(false);
    });
  });

  describe("getAllFiles with .dxtignore", () => {
    let testStructure: string;

    beforeEach(() => {
      // Create test directory structure
      testStructure = path.join(tempDir, "test-extension");
      fs.mkdirSync(testStructure);
      fs.mkdirSync(path.join(testStructure, "src"));
      fs.mkdirSync(path.join(testStructure, "tests"));
      fs.mkdirSync(path.join(testStructure, "coverage"));
      fs.mkdirSync(path.join(testStructure, "logs"));

      // Create test files
      fs.writeFileSync(path.join(testStructure, "manifest.json"), "{}");
      fs.writeFileSync(
        path.join(testStructure, "src/index.js"),
        "console.log('hi')",
      );
      fs.writeFileSync(path.join(testStructure, "tests/test.js"), "test()");
      fs.writeFileSync(
        path.join(testStructure, "coverage/report.txt"),
        "coverage",
      );
      fs.writeFileSync(path.join(testStructure, "logs/debug.log"), "log");
      fs.writeFileSync(path.join(testStructure, "debug.log"), "log");
    });

    it("should exclude files matching .dxtignore patterns", () => {
      // Create .dxtignore
      const dxtIgnoreContent = `*.log
tests/
coverage/`;
      fs.writeFileSync(
        path.join(testStructure, ".dxtignore"),
        dxtIgnoreContent,
      );

      const patterns = readDxtIgnorePatterns(testStructure);
      const files = getAllFiles(testStructure, testStructure, {}, patterns);

      const fileNames = Object.keys(files);

      // Should include
      expect(fileNames).toContain("manifest.json");
      expect(fileNames).toContain("src/index.js");

      // Should exclude
      expect(fileNames).not.toContain("debug.log");
      expect(fileNames).not.toContain("logs/debug.log");
      expect(fileNames).not.toContain("tests/test.js");
      expect(fileNames).not.toContain("coverage/report.txt");
      expect(fileNames).not.toContain(".dxtignore");
    });

    it("should exclude both default patterns and .dxtignore patterns", () => {
      // Create .dxtignore
      const dxtIgnoreContent = `tests/`;
      fs.writeFileSync(
        path.join(testStructure, ".dxtignore"),
        dxtIgnoreContent,
      );

      // Create a .git file (default exclusion)
      fs.writeFileSync(path.join(testStructure, ".gitignore"), "ignore");

      const patterns = readDxtIgnorePatterns(testStructure);
      const files = getAllFiles(testStructure, testStructure, {}, patterns);

      const fileNames = Object.keys(files);

      // Should include
      expect(fileNames).toContain("manifest.json");
      expect(fileNames).toContain("src/index.js");

      // Should exclude (from .dxtignore)
      expect(fileNames).not.toContain("tests/test.js");

      // Should exclude (from default patterns)
      expect(fileNames).not.toContain(".gitignore");
    });

    it("should work without .dxtignore file", () => {
      const files = getAllFiles(testStructure, testStructure, {}, []);
      const fileNames = Object.keys(files);

      // Should include all files except default exclusions
      expect(fileNames).toContain("manifest.json");
      expect(fileNames).toContain("src/index.js");
      expect(fileNames).toContain("tests/test.js");
      expect(fileNames).toContain("coverage/report.txt");
      // Note: *.log files are excluded by default, so these won't be included
      expect(fileNames).not.toContain("logs/debug.log");
      expect(fileNames).not.toContain("debug.log");
    });
  });

  describe("Pattern matching edge cases", () => {
    it("should handle nested directories", () => {
      const additionalPatterns = ["node_modules/"];

      expect(
        shouldExclude("node_modules/package/index.js", additionalPatterns),
      ).toBe(true);
      expect(
        shouldExclude("src/node_modules/package/index.js", additionalPatterns),
      ).toBe(true);
    });

    it("should handle paths with directory patterns", () => {
      const additionalPatterns = ["tests/"];

      expect(shouldExclude("tests/unit/test.js", additionalPatterns)).toBe(
        true,
      );
      expect(
        shouldExclude("tests/integration/test.js", additionalPatterns),
      ).toBe(true);
      // Note: "tests" appears anywhere in path due to current implementation
      expect(shouldExclude("src/tests/test.js", additionalPatterns)).toBe(true);
      // But paths without "tests" should not be excluded
      expect(shouldExclude("src/main.js", additionalPatterns)).toBe(false);
    });

    it("should match patterns (implementation details)", () => {
      const additionalPatterns = ["specific-file.LOG"];

      // Test that the pattern is matched
      expect(shouldExclude("specific-file.LOG", additionalPatterns)).toBe(true);

      // Test completely different file name
      expect(shouldExclude("totally-different.txt", additionalPatterns)).toBe(
        false,
      );
    });
  });

  describe("Negation patterns", () => {
    it("should include files that match negation patterns", () => {
      const additionalPatterns = ["*.log", "!important.log"];

      // debug.log should be excluded (matches *.log, no negation)
      expect(shouldExclude("debug.log", additionalPatterns)).toBe(true);

      // important.log should NOT be excluded (matches *.log, but negated by !important.log)
      expect(shouldExclude("important.log", additionalPatterns)).toBe(false);

      // Other files should not be excluded
      expect(shouldExclude("main.js", additionalPatterns)).toBe(false);
    });

    it("should handle multiple negation patterns", () => {
      const additionalPatterns = ["*.log", "!important.log", "!critical.log"];

      expect(shouldExclude("debug.log", additionalPatterns)).toBe(true);
      expect(shouldExclude("important.log", additionalPatterns)).toBe(false);
      expect(shouldExclude("critical.log", additionalPatterns)).toBe(false);
      expect(shouldExclude("other.log", additionalPatterns)).toBe(true);
    });

    it("should handle negation with glob patterns", () => {
      const additionalPatterns = ["temp/*", "!temp/important.txt"];

      expect(shouldExclude("temp/debug.txt", additionalPatterns)).toBe(true);
      expect(shouldExclude("temp/important.txt", additionalPatterns)).toBe(
        false,
      );
      expect(shouldExclude("other/file.txt", additionalPatterns)).toBe(false);
    });

    it("should handle negation with directory patterns", () => {
      const additionalPatterns = ["tests/", "!tests/critical/"];

      expect(shouldExclude("tests/unit/test.js", additionalPatterns)).toBe(
        true,
      );
      expect(shouldExclude("tests/critical/test.js", additionalPatterns)).toBe(
        false,
      );
      expect(shouldExclude("src/main.js", additionalPatterns)).toBe(false);
    });

    it("should not negate files that don't match exclusion patterns", () => {
      const additionalPatterns = ["*.log", "!main.js"];

      // main.js should not be excluded (doesn't match *.log, negation doesn't apply)
      expect(shouldExclude("main.js", additionalPatterns)).toBe(false);

      // debug.log should be excluded (matches *.log, no applicable negation)
      expect(shouldExclude("debug.log", additionalPatterns)).toBe(true);
    });
  });
});
