import type Dockerode from "dockerode";
import { logger } from "../../../util/logger.ts";
import type { ContainerProps } from "./types.ts";
import { strictEqual } from "./utils.ts";

export function parseNetworkMode(
  networking: ContainerProps["networking"],
): string | undefined {
  return networking === "none"
    ? "none"
    : networking === "bridge"
      ? "bridge"
      : networking === "host"
        ? "host"
        : typeof networking === "string"
          ? networking
          : networking && typeof networking === "object"
            ? "none"
            : "bridge";
}

export async function reconcileNetworks(opts: {
  id: string;
  fqn: string;
  api: Dockerode;
  container: Dockerode.Container;
  props: ContainerProps;
}) {
  const { id, fqn, api, container, props } = opts;

  const details = await container.inspect();

  // If it's a string it was directly passed to the engine on container creation
  if (!props.networking || typeof props.networking === "string") {
    return;
  }

  const existingNetworks = Object.keys(details.NetworkSettings.Networks);
  const expectedNetworks = Object.keys(props.networking ?? {});
  const unknownNetworks: string[] = [];
  for (const network of existingNetworks) {
    if (!expectedNetworks.includes(network)) {
      unknownNetworks.push(network);
    }
  }

  if (expectedNetworks.includes("none") && expectedNetworks.length > 1) {
    throw new Error(
      "Cannot connect to none network along with other networks. Prefer using `networking: 'none'` instead.",
    );
  }

  if (existingNetworks.includes("none") && expectedNetworks.length > 0) {
    await api
      .getNetwork("none")
      .disconnect({
        Container: details.Id,
      })
      .catch((err) => {
        if (err.message.includes("not connected to network")) {
          return;
        }

        throw err;
      });
  }

  // Connect to all expected networks
  for (const network of expectedNetworks) {
    let alreadyConnected = existingNetworks.includes(network);
    let needsReconnect = false;

    // If already connected by name, verify the network ID matches
    if (alreadyConnected) {
      const currentNetworkSettings = details.NetworkSettings.Networks[network];
      const expectedConfig = props.networking?.[network];

      // Get the expected network ID
      const expectedNetworkInfo = await api.getNetwork(network).inspect();
      const expectedNetworkId = expectedNetworkInfo.Id;

      // Check if the network ID has changed (network was recreated with same name)
      if (currentNetworkSettings.NetworkID !== expectedNetworkId) {
        needsReconnect = true;
      } else if (hasNetworkChanged(expectedConfig, currentNetworkSettings)) {
        // Check if settings have changed for the same network
        needsReconnect = true;
      }

      if (!needsReconnect) {
        continue;
      }

      await api
        .getNetwork(network)
        .disconnect({ Container: details.Id })
        .catch((err) => {
          if (err.message.includes("not connected to network")) {
            return;
          }

          throw err;
        });
    }

    // Connect (either new connection or reconnection)
    logger.task(fqn, {
      prefix: alreadyConnected ? "reconnect" : "connect",
      prefixColor: alreadyConnected ? "yellowBright" : "greenBright",
      resource: id,
      message: `${alreadyConnected ? "Reconnecting to" : "Connecting to"} network ${network}`,
      status: "pending",
    });
    // @ts-expect-error - GwPriority is not present on Dockerode's NetworkSettings type
    await api.getNetwork(network).connect({
      Container: details.Id,
      EndpointConfig: {
        Aliases: props.networking?.[network]?.aliases,
        MacAddress: props.networking?.[network]?.macAddress,
        DriverOpts: props.networking?.[network]?.driverOpts,
        GwPriority: props.networking?.[network]?.priority,
        IPAMConfig: {
          IPv4Address: props.networking?.[network]?.ipv4,
          IPv6Address: props.networking?.[network]?.ipv6,
          LinkLocalIPs: props.networking?.[network]?.linkLocalIPs,
        },
      },
    });
  }

  // Disconnect from all unknown networks
  for (const network of unknownNetworks) {
    if (!existingNetworks.includes(network) || network === "none") {
      continue;
    }

    logger.task(fqn, {
      prefix: "disconnect",
      prefixColor: "redBright",
      resource: id,
      message: `Disconnecting from network ${network}`,
      status: "pending",
    });
    await api
      .getNetwork(network)
      .disconnect({ Container: details.Id })
      .catch((err) => {
        if (err.message.includes("not connected to network")) {
          return;
        }

        throw err;
      });
  }

  if (expectedNetworks.length === 0 && !existingNetworks.includes("none")) {
    await api.getNetwork("none").connect({
      Container: details.Id,
    });
  }
}

function hasNetworkChanged(
  expectedConfig:
    | NonNullable<Exclude<ContainerProps["networking"], string>>[string]
    | undefined,
  currentNetworkSettings:
    | NonNullable<
        Dockerode.ContainerInspectInfo["NetworkSettings"]["Networks"]
      >[string]
    | undefined,
) {
  // Compare aliases (order-independent comparison)
  const expectedAliases = expectedConfig?.aliases ?? [];
  const currentAliases = currentNetworkSettings?.Aliases ?? [];

  return (
    // Aliases
    expectedAliases.length !== currentAliases.length ||
    !expectedAliases.every((alias) => currentAliases.includes(alias)) ||
    // Driver options
    !strictEqual(
      expectedConfig?.driverOpts ?? null,
      // @ts-expect-error - DriverOpts is not present on Dockerode's NetworkSettings type
      currentNetworkSettings?.DriverOpts,
    ) ||
    // Priority
    (expectedConfig?.priority ?? 0) !==
      // @ts-expect-error - GwPriority is not present on Dockerode's NetworkSettings type
      (currentNetworkSettings?.GwPriority ?? 0) ||
    // IPAM
    expectedConfig?.ipv4 !== currentNetworkSettings?.IPAMConfig?.IPv4Address ||
    expectedConfig?.ipv6 !== currentNetworkSettings?.IPAMConfig?.IPv6Address ||
    JSON.stringify(expectedConfig?.linkLocalIPs) !==
      JSON.stringify(currentNetworkSettings?.IPAMConfig?.LinkLocalIPs)
  );
}
