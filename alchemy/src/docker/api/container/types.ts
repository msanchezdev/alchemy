import type { DurationString } from "../../../util/duration.ts";
import type { DockerHost } from "../docker-host.ts";
import type { DockerRegistry } from "../docker-registry.ts";
import type { Image } from "../image.ts";
import type { VolumeMountDefinition } from "./volumes.ts";

export interface ContainerProps {
  /**
   * Image to use for the container.
   */
  image: Image | string;

  /**
   * Name of the container.
   * @format `/?[a-zA-Z0-9][a-zA-Z0-9_.-]+`
   * @default ${app}-${stage}-${id}
   */
  name?: string;

  /**
   * The hostname to use for the container, as a valid RFC 1123 hostname.
   */
  hostname?: string;

  /**
   * The domain name to use for the container.
   */
  domain?: string;

  /**
   * Gives the container full access to the host.
   * @default false
   */
  privileged?: boolean;

  /**
   * Commands run as this user inside the container. If omitted, commands run as the user specified in the image the container was started from.
   * Can be either user-name or UID, and optional group-name or GID, separated by a colon (<user-name|UID>[<:group-name|GID>]).
   * @example
   * "alice"
   * "alice:users"
   * "1000"
   * "1000:1000"
   * "alice:users"
   * "1000:1000"
   */
  user?: string;

  /**
   * Command to run in the container.
   */
  command?: string[];

  /**
   * Entrypoint to run in the container.
   *
   * If the array consists of exactly one empty string `[""]` then the entry point
   * is reset to system default (i.e., the entry point used by docker when there
   * is no `ENTRYPOINT` instruction in the Dockerfile
   */
  entrypoint?: string[];

  /**
   * Working directory for the container.
   */
  cwd?: string;

  /**
   * Environment variables to set in the container.
   */
  environment?: Record<string, string> | string[];

  /**
   * Port mappings from container to host. If true, all ports exposed ports are
   * mapped randomly to the host.
   *
   * If an object is provided, the key is the container's port with protocol
   * (e.g., "80/tcp", "443/tcp") and the value is the host port to map to
   * (e.g., "8080", "8443", "0.0.0.0:8080", true to map to a random port).
   *
   * If an array is provided, the ports are mapped to random host ports.
   *
   * @example
   * {
   *   "80/tcp": "8080",
   *   "443/tcp": "8443",
   *   "3000/tcp": "3000"
   * }
   */
  ports?:
    | Record<string, true | PortBinding | PortBinding[]>
    | PortBinding[]
    | true;

  /**
   * Labels to apply to the container.
   */
  labels?: Record<string, string>;

  /**
   * Restart policy for the container.
   * @example
   * "no" // no restart
   * "always" // always restart
   * "on-failure" // restart on failure
   * "unless-stopped" // restart unless stopped
   */
  restart?:
    | "no"
    | "always"
    | "on-failure"
    // Dont wanna make another depth level for this
    | `on-failure < ${number}`
    | "unless-stopped";

  /**
   * Configure networking for the container. Can be a string specifying the network mode.
   * @example
   * "none" // no network
   * "bridge" // bridge network
   * "host" // host network
   * "network_xyz" // custom network name or ID
   * "container:hello-world" // use an existing container's network namespace
   */
  networking?:
    | "none"
    | "bridge"
    | "host"
    | (string & {})
    | Record<string, NetworkEndpointConfig>;

  /**
   * Volume mounts for the container.
   *
   *
   * @example
   * {
   *   "/var/lib/data": await Volume("data-volume"),
   *   "/var/lib/mysql": Mount.Volume("mysql-data"),
   *   "/var/log/mysql": Mount.Path("/var/log/mysql"),
   *   "/app": "./",
   *   "/tmp": Mount.Tmpfs(),
   * }
   */
  volumes?: Record<string, VolumeMountDefinition>;

  /**
   * Health check configuration.
   * If omitted, inherit from image or parent image. If `null`, disables healthcheck.
   */
  healthcheck?: HealthcheckConfig | null;

  /**
   * Desired state of the container
   * - running: start the container if it is not running
   * - stopped: stop the container if it is running
   * - paused: pause the container if it is running, otherwise start and pause
   * @default "running"
   */
  status?: "running" | "stopped" | "paused";

  /**
   * Keep the container after destroying the resource.
   * @default false
   */
  keep?: boolean;

  /**
   * Force the container to be recreated when properties change.
   */
  recreate?: boolean;

  /**
   * Docker host to use for the container.
   */
  dockerHost?: DockerHost<Record<string, DockerRegistry>>;
}

export interface HealthcheckConfig {
  /**
   * The test to perform. Possible values:
   * - `undefined`: inherit healthcheck from image or parent image
   * - `null`: disable healthcheck
   * - `string[]`: exec arguments directly (e.g. `["curl", "-f", "http://localhost/"]`)
   * - `string`: run command with container's default shell (e.g. `"curl -f http://localhost/ || exit 1"`)
   */
  test?: undefined | null | string | string[];

  /**
   * Time to wait between checks.
   * Can be a number in milliseconds or a duration string.
   * `0` or `undefined` means inherit from image or parent image.
   * @min '1ms'
   * @example '1s'
   * @example '1m 20s'
   * @example 6 * 1000 // 6 seconds
   */
  interval?: number | DurationString;

  /**
   * The time to wait before considering the check to have hung.
   * Can be a number in milliseconds or a duration string.
   * `0` or `undefined` means inherit from image or parent image.
   * @min '1ms'
   * @example '1s'
   * @example '1m 20s'
   * @example 6 * 1000 // 6 seconds
   */
  timeout?: number | DurationString;

  /**
   * Start period for the container to initialize before starting health-retries countdown.
   * Can be a number in milliseconds or a duration string.
   * `0` or `undefined` means inherit from image or parent image.
   * @min '1ms'
   * @example '1s'
   * @example '1m 20s'
   * @example 6 * 1000 // 6 seconds
   */
  startPeriod?: number | DurationString;

  /**
   * The time to wait between checks during the start period.
   * Can be a number in milliseconds or a duration string.
   * `0` or `undefined` means inherit from image or parent image.
   * @min '1ms'
   * @example '1s'
   * @example '1m 20s'
   * @example 6 * 1000 // 6 seconds
   */
  startInterval?: number | DurationString;

  /**
   * The number of consecutive failures needed to consider a container as unhealthy.
   * `0` or `undefined` means inherit from image or parent image.
   * @default 3
   */
  retries?: number;
}

export interface NetworkEndpointConfig {
  /**
   * Network-scoped aliases for this container
   */
  aliases?: string[];

  /**
   * IPv4 address.
   */
  ipv4?: string;

  /**
   * IPv6 address.
   */
  ipv6?: string;

  /**
   * Link-local IPv4 addresses.
   */
  linkLocalIPs?: string[];

  /**
   * MAC address for the endpoint on this network. The network driver
   * might ignore this parameter.
   * @example "02:42:ac:11:00:02"
   */
  macAddress?: string;

  /**
   * Driver-specific options
   */
  driverOpts?: { [key: string]: string };

  /**
   * This property determines which endpoint will provide the default
   * gateway for a container. The endpoint with the highest priority
   * will be used.
   *
   * If multiple endpoints have the same priority, endpoints are
   * lexicographically sorted based on their network name, and the one
   * that sorts first is picked.
   */
  priority?: number;
}

export type PortBinding = string | number;
