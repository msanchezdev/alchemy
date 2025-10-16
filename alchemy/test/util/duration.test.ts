import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { BRANCH_PREFIX } from "../util.ts";
// must import this or else alchemy.test won't exist
import "../../src/test/vitest.ts";
import { formatDuration, parseDuration } from "../../src/util/duration.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("formatDuration", () => {
  test("default = from ms to all units", async () => {
    expect(formatDuration(1)).toEqual("1ms");
    expect(formatDuration(100)).toEqual("100ms");
    expect(formatDuration(890)).toEqual("890ms");
    expect(formatDuration(1000)).toEqual("1s");
    expect(formatDuration(1200)).toEqual("1s 200ms");
    expect(formatDuration(60000)).toEqual("1m");
    expect(formatDuration(90000)).toEqual("1m 30s");
    expect(formatDuration(3600000)).toEqual("1h");
    expect(formatDuration(86400000)).toEqual("1d");
    expect(formatDuration(604800000)).toEqual("1w");
    expect(formatDuration(31536000000)).toEqual("1y");
  });

  test("to us", async () => {
    expect(formatDuration(1, { to: "us" })).toEqual("1000us");
    expect(formatDuration(10, { to: "us" })).toEqual("10000us");
    expect(formatDuration(1000, { to: "us" })).toEqual("1000000us");
    expect(formatDuration(24 * 60 * 60 * 1000, { to: "us" })).toEqual(
      "86400000000us",
    );
    expect(formatDuration(0.1, { to: "us" })).toEqual("100us");
    expect(formatDuration(0.01, { to: "us" })).toEqual("10us");
    expect(formatDuration(0.001, { to: "us" })).toEqual("1us");
    expect(formatDuration(0.0001, { to: "us" })).toEqual("0.1us");
  });

  test("to ns", async () => {
    expect(formatDuration(1, { to: "ns" })).toEqual("1000000ns");
    expect(formatDuration(10, { to: "ns" })).toEqual("10000000ns");
    expect(formatDuration(0.1, { to: "ns" })).toEqual("100000ns");
  });

  test("to ms", async () => {
    expect(formatDuration(1, { to: "ms" })).toEqual("1ms");
    expect(formatDuration(100, { to: "ms" })).toEqual("100ms");
    expect(formatDuration(890, { to: "ms" })).toEqual("890ms");
    expect(formatDuration(1000, { to: "ms" })).toEqual("1000ms");
    expect(formatDuration(1200, { to: "ms" })).toEqual("1200ms");
    expect(formatDuration(0.1, { to: "ms" })).toEqual("0.1ms");
  });

  test("to s", async () => {
    expect(formatDuration(1000, { to: "s" })).toEqual("1s");
    expect(formatDuration(100000, { to: "s" })).toEqual("100s");
    expect(formatDuration(900, { to: "s" })).toEqual("0.9s");
    expect(formatDuration(90, { to: "s" })).toEqual("0.09s");
    expect(formatDuration(9, { to: "s" })).toEqual("0.01s");
  });

  test("to m", async () => {
    expect(formatDuration(60 * 1000, { to: "m" })).toEqual("1m");
    expect(formatDuration(5 * 60 * 1000, { to: "m" })).toEqual("5m");
    expect(formatDuration(1200, { to: "m" })).toEqual("0.02m");
    expect(formatDuration(6000, { to: "m" })).toEqual("0.1m");
  });

  test("to h", async () => {
    expect(formatDuration(60 * 60 * 1000, { to: "h" })).toEqual("1h");
    expect(formatDuration(5 * 60 * 60 * 1000, { to: "h" })).toEqual("5h");
    expect(formatDuration(0.028 * 60 * 60 * 1000, { to: "h" })).toEqual(
      "0.03h",
    );
    expect(formatDuration(0.1 * 60 * 60 * 1000, { to: "h" })).toEqual("0.1h");
  });

  test("to d", async () => {
    expect(formatDuration(24 * 60 * 60 * 1000, { to: "d" })).toEqual("1d");
    expect(formatDuration(5 * 24 * 60 * 60 * 1000, { to: "d" })).toEqual("5d");
    expect(formatDuration(0.01 * 24 * 60 * 60 * 1000, { to: "d" })).toEqual(
      "0.01d",
    );
    expect(formatDuration(0.1 * 24 * 60 * 60 * 1000, { to: "d" })).toEqual(
      "0.1d",
    );
  });

  test("to w", async () => {
    expect(formatDuration(7 * 24 * 60 * 60 * 1000, { to: "w" })).toEqual("1w");
    expect(formatDuration(5 * 7 * 24 * 60 * 60 * 1000, { to: "w" })).toEqual(
      "5w",
    );
    expect(formatDuration(0.02 * 7 * 24 * 60 * 60 * 1000, { to: "w" })).toEqual(
      "0.02w",
    );
    expect(formatDuration(0.1 * 7 * 24 * 60 * 60 * 1000, { to: "w" })).toEqual(
      "0.1w",
    );
  });

  test("to y", async () => {
    expect(formatDuration(365 * 24 * 60 * 60 * 1000, { to: "y" })).toEqual(
      "1y",
    );
    expect(formatDuration(5 * 365 * 24 * 60 * 60 * 1000, { to: "y" })).toEqual(
      "5y",
    );
    expect(
      formatDuration(0.001 * 365 * 24 * 60 * 60 * 1000, { to: "y" }),
    ).toEqual("0y");
    expect(
      formatDuration(0.1 * 365 * 24 * 60 * 60 * 1000, { to: "y" }),
    ).toEqual("0.1y");
  });

  test("decimal formatting for different units", async () => {
    // Test minutes with decimals when no smaller units
    expect(formatDuration(1200, { to: "m" })).toEqual("0.02m");

    // Test hours with decimals when no smaller units
    expect(formatDuration(120000, { to: "h" })).toEqual("0.03h");

    // Test days with decimals when no smaller units
    expect(formatDuration(1200000, { to: "d" })).toEqual("0.01d");

    // Test weeks with decimals when no smaller units
    expect(formatDuration(12000000, { to: "w" })).toEqual("0.02w");

    // Test years with decimals when no smaller units
    expect(formatDuration(120000000, { to: "y" })).toEqual("0y"); // Too small for 1 decimal place
  });

  test("decimal precision control", async () => {
    expect(formatDuration(1200, { to: "m", decimalPlaces: 3 })).toEqual(
      "0.02m",
    );
    expect(formatDuration(1234, { to: "m", decimalPlaces: 3 })).toEqual(
      "0.021m",
    );
  });

  test("mixed units with decimals", async () => {
    // Should not show decimals when smaller units are available
    expect(formatDuration(90000)).toEqual("1m 30s"); // 1.5m but shows as 1m 30s
    expect(formatDuration(90000, { to: { m: true, s: false } })).toEqual(
      "1.5m",
    ); // 1.5m when s is disabled
  });

  test("different from units", async () => {
    expect(formatDuration(1, { from: "s", to: "ms" })).toEqual("1000ms");
    expect(formatDuration(1, { from: "m", to: "s" })).toEqual("60s");
    expect(formatDuration(1, { from: "h", to: "m" })).toEqual("60m");
  });

  test("microseconds and nanoseconds", async () => {
    expect(formatDuration(1, { to: "ms" })).toEqual("1ms");
    expect(formatDuration(1, { to: "us" })).toEqual("1000us");
    expect(formatDuration(1, { to: "ns" })).toEqual("1000000ns");
    expect(formatDuration(0.001, { to: "ns" })).toEqual("1000ns");
  });
});

describe("parseDuration", () => {
  test("parse single units", async () => {
    expect(parseDuration("1ms")).toEqual(1);
    expect(parseDuration("1s")).toEqual(1000);
    expect(parseDuration("1m")).toEqual(60000);
    expect(parseDuration("1h")).toEqual(3600000);
    expect(parseDuration("1d")).toEqual(86400000);
    expect(parseDuration("1w")).toEqual(604800000);
    expect(parseDuration("1y")).toEqual(31536000000);
  });

  test("parse decimal values", async () => {
    expect(parseDuration("0.5ms")).toEqual(0.5);
    expect(parseDuration("0.5s")).toEqual(500);
    expect(parseDuration("0.5m")).toEqual(30000);
    expect(parseDuration("0.5h")).toEqual(1800000);
    expect(parseDuration("0.5d")).toEqual(43200000);
    expect(parseDuration("0.5w")).toEqual(302400000);
    expect(parseDuration("0.5y")).toEqual(15768000000);
  });

  test("parse multiple units", async () => {
    expect(parseDuration("1m 30s")).toEqual(90000);
    expect(parseDuration("1h 30m")).toEqual(5400000);
    expect(parseDuration("1d 2h")).toEqual(93600000);
    expect(parseDuration("1w 3d")).toEqual(864000000); // 7 days + 3 days = 10 days
    expect(parseDuration("2m 30s 500ms")).toEqual(150500);
  });

  test("parse complex combinations", async () => {
    expect(parseDuration("1y 2w 3d 4h 5m 6s 7ms")).toEqual(
      31536000000 +
        2 * 604800000 +
        3 * 86400000 +
        4 * 3600000 +
        5 * 60000 +
        6 * 1000 +
        7,
    );
  });

  test("parse with different cases", async () => {
    expect(parseDuration("1MS")).toEqual(1);
    expect(parseDuration("1S")).toEqual(1000);
    expect(parseDuration("1M")).toEqual(60000);
    expect(parseDuration("1H")).toEqual(3600000);
  });

  test("parse with µs unit", async () => {
    expect(parseDuration("1µs")).toEqual(0.001); // 1µs = 0.001ms
    expect(parseDuration("1000µs")).toEqual(1); // 1000µs = 1ms
    expect(parseDuration("1500µs")).toEqual(1.5); // 1500µs = 1.5ms

    expect(parseDuration("1us")).toEqual(0.001); // 1us = 0.001ms
    expect(parseDuration("1000us")).toEqual(1); // 1000us = 1ms
    expect(parseDuration("1500us")).toEqual(1.5); // 1500us = 1.5ms
  });

  test("parse very small units", async () => {
    // Test 1 microsecond in different units
    expect(parseDuration("1us", "ms")).toEqual(0.001);
    expect(parseDuration("1us", "us")).toEqual(1);
    expect(parseDuration("1us", "ns")).toEqual(1000);

    // Test 100 microseconds
    expect(parseDuration("100us", "ms")).toEqual(0.1);
    expect(parseDuration("100us", "us")).toEqual(100);
    expect(parseDuration("100us", "ns")).toEqual(100000);

    // Test 1 nanosecond
    expect(parseDuration("1ns", "ms")).toEqual(0.000001);
    expect(parseDuration("1ns", "us")).toEqual(0.001);
    expect(parseDuration("1ns", "ns")).toEqual(1);

    // Test 100 nanoseconds
    expect(parseDuration("100ns", "ms")).toEqual(0.0001);
    expect(parseDuration("100ns", "us")).toEqual(0.1);
    expect(parseDuration("100ns", "ns")).toEqual(100);
  });

  test("parse to custom units", async () => {
    // Parse to seconds
    expect(parseDuration("1m", "s")).toEqual(60);
    expect(parseDuration("90s", "s")).toEqual(90);
    expect(parseDuration("0.5m", "s")).toEqual(30);

    // Parse to minutes
    expect(parseDuration("1h", "m")).toEqual(60);
    expect(parseDuration("90m", "m")).toEqual(90);
    expect(parseDuration("1.5h", "m")).toEqual(90);

    // Parse to hours
    expect(parseDuration("1d", "h")).toEqual(24);
    expect(parseDuration("48h", "h")).toEqual(48);

    // Parse to days
    expect(parseDuration("1w", "d")).toEqual(7);
    expect(parseDuration("14d", "d")).toEqual(14);

    // Parse microseconds to different units
    expect(parseDuration("1000us", "ms")).toEqual(1);
    expect(parseDuration("1000000us", "s")).toEqual(1);
  });

  test("error handling", async () => {
    expect(() => parseDuration("")).toThrow(
      "Duration string must be a non-empty string",
    );
    expect(() => parseDuration("invalid")).toThrow("Invalid duration format");
    expect(() => parseDuration("1invalid")).toThrow("Unknown duration unit");
    expect(() => parseDuration("abcms")).toThrow("Invalid duration format");
    expect(() => parseDuration(null as any)).toThrow(
      "Duration string must be a non-empty string",
    );
    expect(() => parseDuration("1ms", "invalid" as any)).toThrow(
      "Unknown target unit",
    );
  });

  test("round trip with formatDuration", async () => {
    const testCases = [
      1,
      1000,
      60000,
      90000,
      3600000,
      86400000,
      1200, // 0.02m
      0.001, // 1ms
    ];

    for (const ms of testCases) {
      const formatted = formatDuration(ms);
      const parsed = parseDuration(formatted);
      expect(parsed).toBeCloseTo(ms, 0); // Allow for rounding differences
    }
  });

  test("parse edge cases", async () => {
    expect(parseDuration("0ms")).toEqual(0);
    expect(parseDuration("0s")).toEqual(0);
    expect(parseDuration("0.000ms")).toEqual(0);
  });
});
