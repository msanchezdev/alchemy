import type Dockerode from "dockerode";
import type { NetworkCreateOptions } from "dockerode";
import type { Context } from "../../context.ts";
import { Resource } from "../../resource.ts";
import { diff } from "../../util/diff.ts";
import { logger } from "../../util/logger.ts";
import { DockerHost } from "./docker-host.ts";

/**
 * Properties for creating a Docker network
 */
export interface NetworkProps {
  /**
   * The network's name.
   * Defaults to the resource ID.
   * @example "my-network"
   */
  name?: string;
  /**
   * Name of the network driver plugin to use.
   * @default "bridge"
   */
  driver?: "bridge" | "host" | "none" | "overlay" | "macvlan" | (string & {});
  /**
   * The level at which the network exists (e.g. `swarm` for cluster-wide
   * or `local` for machine level).
   * @default "local"
   */
  scope?: string;
  /**
   * Restrict external access to the network.
   */
  internal?: boolean;
  /**
   * Globally scoped network is manually attachable by regular
   * containers from workers in swarm mode.
   * @default true
   */
  attachable?: boolean;
  /**
   * Ingress network is the network which provides the routing-mesh
   * in swarm mode.
   *
   */
  ingress?: boolean;
  // /**
  //  * Creates a config-only network. Config-only networks are placeholder
  //  * networks for network configurations to be used by other networks.
  //  * Config-only networks cannot be used directly to run containers
  //  * or services.
  //  *
  //  */
  // ConfigOnly?: boolean;
  // ConfigFrom?: ConfigReference;

  ipamDriver?: string;
  ipamOptions?: {
    [key: string]: string;
  } | null;
  /**
   * IPv4 Configuration, if true the network will have an IPv4 subnet, if an array of IpamConfig the network will have the given subnet and gateway.
   */
  ipv4?: boolean | [IpamConfig, ...IpamConfig[]];
  /**
   * IPv6 Configuration, if true the network will have an IPv6 subnet, if an array of IpamConfig the network will have the given subnet and gateway.
   */
  ipv6?: boolean | [IpamConfig, ...IpamConfig[]];
  /**
   * Network specific options to be used by the drivers.
   */
  options?: {
    [key: string]: string;
  };
  /**
   * User-defined key/value metadata.
   */
  labels?: {
    [key: string]: string;
  };
  /**
   * Adopt the network if it already exists.
   */
  adopt?: boolean;
  /**
   * Docker host to use.
   */
  dockerHost?: DockerHost;
}

export type Ipam = {
  /**
   * Name of the IPAM driver to use.
   */
  driver?: string;
  /**
   * List of IPAM configuration options, specified as a map:
   *
   * ```
   * {"Subnet": <CIDR>, "IPRange": <CIDR>, "Gateway": <IP address>, "AuxAddress": <device_name:IP address>}
   * ```
   *
   */
  config?: Array<IpamConfig>;
  /**
   * Driver-specific options, specified as a map.
   */
  options?: {
    [key: string]: string;
  };
};

export type IpamConfig = {
  /**
   * The subnet to use for the network.
   * @example "10.33.0.0/16"
   */
  subnet: string;
  /**
   * The IP range to use for the network. Must be inside the specified subnet.
   * @example "10.33.25.0/24"
   */
  ipRange?: string;
  /**
   * The gateway to use for the network.
   * @example "10.33.0.1"
   */
  gateway?: string;
  auxiliaryAddresses?: {
    [key: string]: string;
  };
};

/**
 * Docker Network resource
 */
export interface Network
  extends Resource<"docker::api::Network">,
    Dockerode.NetworkInspectInfo {}

/**
 * Create and manage a Docker Network
 * @see https://docs.docker.com/engine/network/
 */
export const Network = Resource(
  "docker::api::Network",
  {
    alwaysUpdate: true,
  },
  async function (
    this: Context<Network>,
    id: string,
    props: NetworkProps = {},
  ): Promise<Network> {
    // Initialize Docker API client
    const { dockerode: api } = await DockerHost(props.dockerHost);
    const networkName = props.name ?? id;
    const existingNetwork = (await api
      .getNetwork(networkName)
      .inspect()
      .catch(() => null)) as Network | null;

    if (this.phase === "delete") {
      if (existingNetwork) {
        await disconnectAll(api, existingNetwork.Id);
        await api
          .getNetwork(existingNetwork.Id)
          .remove()
          .catch((reason) => {
            if (reason.message.includes("pre-defined network")) {
              return;
            }

            throw reason;
          });
      }

      return this.destroy();
    }

    const expectedNetwork: NetworkCreateOptions = {
      Name: networkName,
      Scope: props.scope ?? "local",
      Internal: props.internal ?? false,
      Attachable: props.attachable ?? false,
      Ingress: props.ingress ?? false,
      EnableIPv6: Boolean(props.ipv6) ?? false,
      Driver: props.driver ?? "bridge",
      Options: {
        ...(existingNetwork?.Options ?? {}),
        ...(props.options ?? {}),
      },
      Labels: {
        ...existingNetwork?.Labels,
        ...props.labels,
      },
      IPAM: {
        ...(existingNetwork?.IPAM ?? {}),
        Driver: props.ipamDriver ?? "default",
        Options: props.ipamOptions ?? (null as any),
      },
    };

    const ipamConfig = [
      ...(Array.isArray(props.ipv4) ? props.ipv4 : []),
      ...(Array.isArray(props.ipv6) ? props.ipv6 : []),
    ].map((config) => {
      const cfg: NonNullable<
        NonNullable<NetworkCreateOptions["IPAM"]>["Config"]
      >[number] = {};

      if ("subnet" in config) {
        cfg.Subnet = config.subnet;
      }
      if ("ipRange" in config) {
        cfg.IPRange = config.ipRange;
      }
      if ("gateway" in config) {
        cfg.Gateway = config.gateway;
      }
      if ("auxiliaryAddresses" in config) {
        cfg.AuxiliaryAddresses = config.auxiliaryAddresses;
      }
      return cfg;
    });

    // TODO: Check properly if this changed, currently always triggering a change
    // even if only an unrelated config changed.
    // hint: diff() returns changes: {
    //                added: [Object: null prototype] {
    //                  IPAM: [Object: null prototype] {
    //                    config: [ { subnet: '10.33.0.0/16', gateway: '10.33.0.1' } ]
    //                  }
    //                }
    //              },
    if (ipamConfig.length > 0) {
      expectedNetwork.IPAM = {
        ...(expectedNetwork?.IPAM ?? {}),
        Config: ipamConfig,
      };
    } else if (existingNetwork?.IPAM?.Config) {
      expectedNetwork.IPAM = {
        ...(expectedNetwork?.IPAM ?? {}),
        Config: existingNetwork.IPAM.Config,
      };
    } else {
      delete expectedNetwork.IPAM?.Config;
    }

    // In some Docker Engine versions, EnableIPv4 is not present even if the
    // engine supports v1.47 where this property was introduced.
    if (
      (existingNetwork && "EnableIPv4" in existingNetwork) ||
      props.ipv4 === false
    ) {
      expectedNetwork.EnableIPv4 =
        props.ipv4 !== undefined
          ? Boolean(props.ipv4)
          : // @ts-expect-error - EnableIPv4 is not present on Dockerode's Network type
            ((existingNetwork?.EnableIPv4 as boolean) ?? true);
    }

    if (this.phase === "update" && existingNetwork) {
      // Check if there are any actual changes before recreating
      const differences = diff(existingNetwork, expectedNetwork);
      const propertiesToCheck = [
        "Name",
        "Scope",
        "Driver",
        "EnableIPv4",
        "EnableIPv6",
        "Internal",
        "Attachable",
        "Ingress",
        "Options",
        "IPAM",
        "Labels",
      ];

      const hasChanges = propertiesToCheck.some((property) =>
        differences.check(property),
      );

      if (!hasChanges) {
        // No changes detected, return existing network
        return this(existingNetwork);
      }

      // For existing networks, we need to remove the network and create it again
      // We can't take advantage of alchemy's replace() because it behaves in
      // a create-then-destroy fashion.

      const preserveIp = shouldPreserveIp(existingNetwork, expectedNetwork);

      logger.task(this.fqn, {
        prefix: "disconnect",
        prefixColor: "yellowBright",
        resource: id,
        message: `Disconnecting containers from network ${existingNetwork.Name}`,
        status: "pending",
      });

      // Disconnect all containers from the network
      const containersSnapshot = await disconnectAll(api, existingNetwork.Id);

      // Remove the old network
      await api.getNetwork(existingNetwork.Id).remove();
      try {
        await api.createNetwork(expectedNetwork);
        logger.task(this.fqn, {
          prefix: "reconnect",
          prefixColor: "yellowBright",
          resource: id,
          message: `Connecting containers to updated network ${networkName}`,
          status: "pending",
        });
      } catch (e) {
        logger.task(this.fqn, {
          prefix: "reconnect",
          prefixColor: "yellowBright",
          resource: id,
          message:
            "Failed to create network with updated properties. Recreating old network and connecting containers to it.",
          status: "pending",
        });
        await api.createNetwork(this.output as NetworkCreateOptions);
        logger.task(this.fqn, {
          prefix: "reconnect",
          prefixColor: "yellowBright",
          resource: id,
          message: "Reconnecting containers to old network.",
          status: "pending",
        });
        throw e;
      } finally {
        await reconnectAll(api, networkName, containersSnapshot, preserveIp);
      }

      const createdNetwork = (await api
        .getNetwork(networkName)
        .inspect()) as Network;
      return this(createdNetwork);
    }

    if (existingNetwork) {
      // FIXME: Network exists but may not match expectedNetwork
      if (props.adopt || this.scope.adopt) {
        logger.task(this.fqn, {
          prefix: "adopting",
          prefixColor: "yellowBright",
          resource: id,
          message: `Adopting existing network ${networkName}`,
          status: "pending",
        });
        return this(existingNetwork);
      } else {
        throw new Error(
          `Network ${networkName} already exists, set adopt to true to adopt it`,
        );
      }
    }

    // Create new network
    await api.createNetwork(expectedNetwork);

    const createdNetwork = (await api
      .getNetwork(networkName)
      .inspect()) as Network;
    return this(createdNetwork);
  },
);

async function disconnectAll(
  api: Dockerode,
  networkName: string,
): Promise<Record<string, Dockerode.NetworkContainer>> {
  const existingNetwork = await api.getNetwork(networkName).inspect();
  const containers = Object.entries(existingNetwork.Containers ?? {});

  // Disconnect all containers from the network
  await Promise.all(
    containers.map(([containerId]) =>
      api
        .getNetwork(existingNetwork.Id)
        .disconnect({
          Container: containerId,
        })
        .catch((error) => {
          logger.warn(
            `Failed to disconnect container ${containerId}:`,
            error.message,
          );
        }),
    ),
  );

  return existingNetwork.Containers;
}

async function reconnectAll(
  api: Dockerode,
  networkName: string,
  containersSnapshot: Record<string, Dockerode.NetworkContainer>,
  preserveIp: boolean,
): Promise<void> {
  await Promise.all(
    Object.entries(containersSnapshot).map(async ([containerId]) => {
      const container = containersSnapshot[containerId];

      const endpoint: Dockerode.NetworkConnectOptions["EndpointConfig"] = {
        EndpointID: container.EndpointID,
        MacAddress: container.MacAddress,
        IPAMConfig: preserveIp
          ? {
              IPv4Address: container.IPv4Address.split("/")[0],
              IPv6Address: container.IPv6Address.split("/")[0],
            }
          : undefined,
      };

      await api
        .getNetwork(networkName)
        .connect({ Container: containerId, EndpointConfig: endpoint })
        .catch((error) => {
          logger.warn(
            `Failed to reconnect container ${containerId}:`,
            error.message,
          );
        });
    }),
  );
}

function shouldPreserveIp(existingNetwork: Network, newNetwork: any): boolean {
  const differences = diff(existingNetwork, newNetwork);
  const reasons: string[] = [];
  const ipInvalidatingProperties = [
    "Scope",
    "Driver",
    "EnableIPv4",
    "EnableIPv6",
    "Internal",
    "Attachable",
    "Ingress",
    "Options",
    "IPAM",
  ];
  for (const property of ipInvalidatingProperties) {
    if (differences.check(property)) {
      reasons.push(`${property} changed`);
    }
  }

  if (differences.check("IPAM.Config")) {
    // TODO: check if IPAM.Config.IPv4Address or IPAM.Config.IPv6Address is different
  }

  if (reasons.length > 0) {
    logger.warn("IP should not be preserved because:", reasons.join(", "));
  }

  return reasons.length === 0;
}
