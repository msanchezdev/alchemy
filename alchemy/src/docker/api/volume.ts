import type Dockerode from "dockerode";
import type { Context } from "../../context.ts";
import { Resource } from "../../resource.ts";
import { DockerHost } from "./docker-host.ts";

/**
 * Properties for creating a Docker volume
 */
export interface VolumeProps {
  /**
   * The volume's name.
   * Defaults to the resource ID.
   * @example "my-volume"
   */
  name?: string;

  /**
   * Volume driver to use
   * @default "local"
   */
  driver?: string;

  /**
   * Driver-specific options
   */
  driverOpts?: Record<string, string>;

  /**
   * User-defined key/value metadata.
   */
  labels?: Record<string, string>;

  /**
   * Keep the volume after destroying the resource.
   * @default true
   */
  keep?: boolean;

  /**
   * Adopt the volume if it already exists.
   */
  adopt?: boolean;

  /**
   * Docker host to use.
   */
  dockerHost?: DockerHost;
}

/**
 * Docker Volume resource
 */
export interface Volume
  extends Resource<"docker::api::Volume">,
    Dockerode.VolumeInspectInfo {}

/**
 * Create and manage a Docker Volume
 *
 * @see https://docs.docker.com/engine/reference/commandline/volume/
 *
 * @example
 * // Create a simple Docker volume:
 * const dataVolume = await Volume("data-volume");
 *
 * @example
 * // Create a volume with custom driver and options:
 * const dbVolume = await Volume("db-data", {
 *   driver: "local",
 *   driverOpts: {
 *     type: "nfs",
 *     o: "addr=10.0.0.1,rw",
 *     device: ":/path/to/dir"
 *   },
 *   labels: {
 *     "com.example.usage": "database-storage",
 *     "com.example.backup": "weekly"
 *   }
 * });
 *
 * @example
 * // Create a volume that will be removed after resource destruction
 * const persistentVolume = await Volume("persistent-data", {
 *   keep: false
 * });
 */
export const Volume = Resource(
  "docker::api::Volume",
  {
    alwaysUpdate: true,
  },
  async function (
    this: Context<Volume, VolumeProps>,
    id: string,
    props: VolumeProps = {},
  ): Promise<Volume> {
    // Initialize Docker API client
    const { dockerode: api } = await DockerHost(props.dockerHost);
    const volumeName =
      props.name ?? this.output?.Name ?? this.scope.createPhysicalName(id);

    // Check if volume already exists
    const existingVolume = (await api
      .getVolume(volumeName)
      .inspect()
      .catch(() => null)) as Volume | null;

    if (this.phase === "delete") {
      if (existingVolume && !props.keep) {
        await api
          .getVolume(existingVolume.Name)
          .remove()
          .catch((reason) => {
            // Ignore error if volume is already gone
            if (!reason.message.includes("No such volume")) {
              throw reason;
            }
          });
      }

      return this.destroy();
    }

    // If volume exists
    if (existingVolume) {
      if (props.adopt || this.scope.adopt) {
        return this(existingVolume);
      } else {
        throw new Error(
          `Volume ${volumeName} already exists, set adopt to true to adopt it`,
        );
      }
    }

    // Create new volume
    const volumeOptions: Dockerode.VolumeCreateOptions = {
      Name: volumeName,
      Driver: props.driver ?? "local",
      DriverOpts: props.driverOpts ?? {},
      Labels: props.labels ?? {},
    };

    await api.createVolume(volumeOptions);

    // Get the created volume info
    const volumeInfo = (await api.getVolume(volumeName).inspect()) as Volume;

    return this(volumeInfo);
  },
);
