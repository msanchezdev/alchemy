import type Dockerode from "dockerode";
import { formatDuration, parseDuration } from "../../../util/duration.ts";
import type { ContainerProps } from "./types.ts";

export function parseHealthcheck(
  healthcheck: ContainerProps["healthcheck"],
  defaults: Dockerode.ImageInspectInfo,
): Dockerode.HealthConfig | undefined {
  const Test =
    healthcheck === null || healthcheck?.test === null
      ? ["NONE"]
      : typeof healthcheck?.test === "string"
        ? ["CMD-SHELL", healthcheck?.test]
        : Array.isArray(healthcheck?.test)
          ? ["CMD", ...healthcheck.test]
          : defaults?.Config?.Healthcheck?.Test;

  return {
    Test,

    Interval:
      typeof healthcheck?.interval === "string"
        ? parseDuration(healthcheck?.interval, "ns")
        : typeof healthcheck?.interval === "number"
          ? parseDuration(
              formatDuration(healthcheck?.interval, {
                from: "ms",
                to: "ns",
              }),
              "ns",
            )
          : (healthcheck?.interval ?? defaults?.Config?.Healthcheck?.Interval),

    Timeout:
      typeof healthcheck?.timeout === "string"
        ? parseDuration(healthcheck?.timeout, "ns")
        : typeof healthcheck?.timeout === "number"
          ? parseDuration(
              formatDuration(healthcheck.timeout, {
                from: "ms",
                to: "ns",
              }),
              "ns",
            )
          : (healthcheck?.timeout ?? defaults?.Config?.Healthcheck?.Timeout),

    StartPeriod:
      typeof healthcheck?.startPeriod === "string"
        ? parseDuration(healthcheck?.startPeriod, "ns")
        : typeof healthcheck?.startPeriod === "number"
          ? parseDuration(
              formatDuration(healthcheck.startPeriod, {
                from: "ms",
                to: "ns",
              }),
              "ns",
            )
          : (healthcheck?.startPeriod ??
            defaults?.Config?.Healthcheck?.StartPeriod),

    StartInterval:
      typeof healthcheck?.startInterval === "string"
        ? parseDuration(healthcheck.startInterval, "ns")
        : typeof healthcheck?.startInterval === "number"
          ? parseDuration(
              formatDuration(healthcheck.startInterval, {
                from: "ms",
                to: "ns",
              }),
              "ns",
            )
          : (healthcheck?.startInterval ??
            defaults?.Config?.Healthcheck?.StartInterval),

    Retries: healthcheck?.retries ?? defaults?.Config?.Healthcheck?.Retries,
  };
}
