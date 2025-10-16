import type Dockerode from "dockerode";
import { logger } from "../../../util/logger.ts";
import type { ContainerProps } from "./types.ts";
import { checkLabels, normalizeName, strictEqual } from "./utils.ts";

export async function hasContainerChanged(
  existing: Dockerode.ContainerInspectInfo | null,
  expected: Dockerode.ContainerCreateOptions & { name: string },
  prevProps: ContainerProps | undefined,
  nextProps: ContainerProps,
  api: Dockerode,
  fqn: string,
  id: string,
): Promise<"soft" | "hard" | "none"> {
  const hardReasons = {
    // Always recreate on changes
    recreate: () => nextProps.recreate,
    // Image changes
    image: () => existing?.Image !== expected.Image,
    // User
    user: () => !strictEqual(existing?.Config?.User, expected.User),
    // Hostname
    hostname: () =>
      expected.Hostname !== undefined
        ? !strictEqual(existing?.Config?.Hostname, expected.Hostname)
        : prevProps?.hostname !== nextProps.hostname,
    // Domain
    domain: () =>
      !strictEqual(existing?.Config?.Domainname, expected.Domainname),
    // Network mode
    networkMode: () =>
      !strictEqual(
        existing?.HostConfig?.NetworkMode,
        expected.HostConfig?.NetworkMode,
      ),
    // Healthcheck
    healthcheck: () =>
      !strictEqual(existing?.Config?.Healthcheck, expected.Healthcheck),
    // Labels
    labels: () => checkLabels(existing?.Config?.Labels, expected?.Labels),
    // Command
    command: () => !strictEqual(existing?.Config?.Cmd, expected.Cmd),
    // Entrypoint
    entrypoint: () =>
      !strictEqual(existing?.Config?.Entrypoint, expected.Entrypoint),
    // Working directory
    workingDir: () =>
      !strictEqual(existing?.Config?.WorkingDir, expected.WorkingDir),
    // Environment
    environment: () =>
      !strictEqual(
        [...new Set(existing?.Config?.Env ?? [])],
        [...new Set(expected.Env ?? [])],
        { arraySort: true },
      ),
    // Port bindings
    portBindings: () =>
      !strictEqual(
        existing?.HostConfig?.PortBindings ?? {},
        expected.HostConfig?.PortBindings ?? {},
      ) ||
      !strictEqual(
        existing?.Config?.ExposedPorts ?? {},
        expected.ExposedPorts ?? {},
      ),
    volumes: () =>
      !strictEqual(
        existing?.HostConfig?.Mounts ?? [],
        expected.HostConfig?.Mounts ?? [],
      ),
    privileged: () =>
      !strictEqual(
        existing?.HostConfig?.Privileged,
        expected.HostConfig?.Privileged,
      ),
  };

  const [hardChange] =
    Object.entries(hardReasons).find(([_reason, fn]) => fn()) ?? [];
  if (hardChange && prevProps) {
    logger.task(fqn, {
      prefix: "soft",
      prefixColor: "yellowBright",
      resource: id,
      message: `Container ${normalizeName(existing?.Name)} has changed (${hardChange}) and will be recreated...`,
      status: "pending",
    });
    return "hard";
  }

  // Networking - fetch network IDs for comparison
  const prevNetworkIds =
    typeof prevProps?.networking === "string"
      ? [prevProps.networking]
      : await Promise.all(
          Object.keys(prevProps?.networking ?? {}).map((network) =>
            api
              .getNetwork(network)
              .inspect()
              .then((network) => network.Id),
          ),
        );
  const nextNetworkIds =
    typeof nextProps.networking === "string"
      ? [nextProps.networking]
      : await Promise.all(
          Object.keys(nextProps.networking ?? {}).map((network) =>
            api
              .getNetwork(network)
              .inspect()
              .then((network) => network.Id),
          ),
        );

  const softReasons = {
    // Name
    name: () => normalizeName(existing?.Name) !== normalizeName(expected.name),
    // Network IDs changed
    networkIds: () => !strictEqual(prevNetworkIds, nextNetworkIds),
    // Network configuration changed
    networkConfig: () =>
      !strictEqual(prevProps?.networking, nextProps.networking),
  };

  const [softChange] =
    Object.entries(softReasons).find(([_reason, fn]) => fn()) ?? [];
  if (softChange && prevProps) {
    logger.task(fqn, {
      prefix: "soft",
      prefixColor: "yellowBright",
      resource: id,
      message: `Container ${normalizeName(existing?.Name)} has changed (${softChange}). Applying...`,
      status: "pending",
    });
    return "soft";
  }

  return "none";
}
