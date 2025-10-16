import type Dockerode from "dockerode";
import { logger } from "../../../util/logger.ts";
import type { ContainerProps } from "./types.ts";

export const symbolTransient = Symbol("Transient data");

export function normalizeName<T extends string | undefined>(name: T): T {
  return name?.replace(/^\/?/, "") as T;
}

export function strictEqual(
  a: any,
  b: any,
  options: { arraySort?: boolean } = {},
): boolean {
  /**
   * Normalize an object for deterministic hashing
   * - Sorts object keys alphabetically
   * - Optionally sorts array elements
   * - Recursively processes nested structures
   */
  const normalize = (obj: any): any => {
    // Handle null/undefined
    if (obj === null || obj === undefined) {
      return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      const normalized = obj.map(normalize);

      // Sort array elements if option is enabled
      if (options.arraySort) {
        return normalized.sort((a, b) => {
          const aStr = JSON.stringify(a);
          const bStr = JSON.stringify(b);
          return aStr.localeCompare(bStr);
        });
      }

      return normalized;
    }

    // Handle objects
    if (
      typeof obj === "object" &&
      !(obj instanceof Date) &&
      !(obj instanceof RegExp)
    ) {
      const normalized: any = {};

      // Sort keys to ensure consistent order
      const keys = Object.keys(obj).sort();

      for (const key of keys) {
        normalized[key] = normalize(obj[key]);
      }

      return normalized;
    }

    // Handle primitives (string, number, boolean, Date, RegExp, etc.)
    return obj;
  };

  // Compare hashes
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function envArrayToObject(
  env: string[] | undefined | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!env || env.length === 0) return out;

  for (const entry of env) {
    // Do not trim; Docker doesn't trim spaces around key/value.
    const eqIdx = entry.indexOf("=");
    if (eqIdx === -1) {
      // No "=" => key present with empty value
      out[entry] = "";
    } else {
      const key = entry.slice(0, eqIdx);
      const value = entry.slice(eqIdx + 1); // may be empty string
      // Ignore empty keys just in case, but keep behavior predictable
      if (key.length > 0) out[key] = value;
    }
  }
  return out;
}

export function mergeEnv(
  existing: Record<string, string> | string[] | undefined,
  newEnv: Record<string, string> | string[] | undefined,
): string[] {
  const existingEnv = Array.isArray(existing)
    ? envArrayToObject(existing)
    : (existing ?? {});
  const newEnvEntries = Array.isArray(newEnv)
    ? envArrayToObject(newEnv)
    : (newEnv ?? {});

  return Object.entries({ ...existingEnv, ...newEnvEntries }).map(
    ([key, value]) => `${key}=${value}`,
  );
}

export function parseRestartPolicy(
  restart: ContainerProps["restart"],
): Dockerode.HostRestartPolicy {
  if (!restart) return { Name: "no" };
  if (restart.startsWith("on-failure < ")) {
    return {
      Name: "on-failure",
      MaximumRetryCount: Number(restart.split(" < ")[1]),
    };
  }
  return { Name: restart };
}

export async function cleanTempOrphans(opts: {
  id: string;
  fqn: string;
  api: Dockerode;
  expected: Dockerode.ContainerCreateOptions & { name: string };
}) {
  const { id, fqn, api, expected } = opts;
  const containers = await api.listContainers({
    filters: {
      name: [
        `^${expected.name.slice(0, 30)}-\\d{${Date.now().toString().length}}$`,
      ],
    },
    all: true,
  });

  for (const container of containers) {
    logger.task(fqn, {
      prefix: "removing",
      prefixColor: "redBright",
      resource: id,
      message: `Removing temporary container ${container.Names[0].substring(1)}`,
      status: "pending",
    });
    await api.getContainer(container.Id).remove();
  }
}

// Platform-injected labels cant be detected by us
const platformLabels: RegExp[] = [
  // Docker Desktop
  /^desktop\.docker\.io\//,
  // Docker Compose,
  /^com\.docker\./,
];

export function checkLabels(
  prevLabels: Record<string, string> | undefined,
  nextLabels: Record<string, string> | undefined,
): boolean {
  prevLabels = structuredClone(prevLabels);

  for (const label of Object.keys(prevLabels ?? {})) {
    if (platformLabels.some((pattern) => pattern.test(label))) {
      // @ts-expect-error - false-positive
      delete prevLabels[label];
    }
  }

  return !strictEqual(prevLabels, nextLabels);
}
