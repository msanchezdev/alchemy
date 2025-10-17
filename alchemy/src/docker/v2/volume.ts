import type Dockerode from "dockerode";
import type { Context } from "../../context.ts";
import { Resource, ResourceKind } from "../../resource.ts";
import { parseBytes } from "../../util/bytes.ts";
import { logger } from "../../util/logger.ts";
import type {
  BindMount,
  ImageMount,
  PartialMountSettings,
  TmpfsMount,
  VolumeMount,
} from "./container/volumes.ts";
import { DockerHost } from "./docker-host.ts";
import type { Image } from "./image.ts";

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
      props.name ??
      this.output?.Name ??
      [this.scope.appName, id, this.scope.stage]
        .map((s) => s.replaceAll(/[^a-z0-9_-]/gi, "_"))
        .join("_");

    // Check if volume already exists
    const existingVolume = (await api
      .getVolume(volumeName)
      .inspect()
      .catch(() => {})) as Volume | null;

    if (this.phase === "delete") {
      if (existingVolume && props.keep === false) {
        await api
          .getVolume(existingVolume.Name)
          .remove()
          .catch((error) => {
            if (error.reason === "no such volume") {
              return;
            }

            throw error;
          });
      }

      return this.destroy();
    }

    // If volume exists
    if (existingVolume) {
      if (props.adopt || this.scope.adopt || !props.name) {
        logger.task(this.fqn, {
          prefix: "adopting",
          prefixColor: "yellowBright",
          resource: id,
          message: `Adopting volume ${volumeName}`,
          status: "pending",
        });
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
    const volumeInfo = await api.getVolume(volumeName).inspect();
    return this(volumeInfo);
  },
);

export const Mount = {
  Volume(
    source: Volume | string,
    props: Omit<VolumeMount, "type" | "source"> = {},
  ): PartialMountSettings {
    return {
      Type: "volume",
      Source: source,
      Target: null,
      ReadOnly: props.readonly ? true : undefined,
      Consistency: props.consistency,
      VolumeOptions: {
        // @ts-expect-error - docker excludes it if false, thus undefined is allowed
        NoCopy: props.copy === false ? true : undefined,
        Subpath: props.subPath,
        // @ts-expect-error - dockerode typing doesnt allow undefined
        Labels: props.labels,
        DriverConfig:
          props.driverName || props.driverOptions
            ? {
                Name: props.driverName,
                Options: props.driverOptions,
              }
            : (undefined as any),
      },
    };
  },
  Bind(
    source: Volume | string,
    props: Omit<BindMount, "type" | "source"> = {},
  ): PartialMountSettings {
    return {
      Type: "bind",
      Source: getVolumeName(source),
      Target: null,
      ReadOnly: props.readonly ? true : undefined,
      Consistency: props.consistency,
      BindOptions: {
        Propagation: props.propagation ?? "rprivate",
        // @ts-expect-error - dockerode typing doesnt have this field
        NonRecursive: props.nonRecursive ? true : undefined,
        ReadOnlyNonRecursive: props.readonlyNonRecursive ? true : undefined,
        ReadOnlyForceRecursive: props.readonlyForceRecursive ? true : undefined,
        CreateMountpoint: props.create ? true : undefined,
      },
    };
  },
  Image(
    source: string | Image,
    props: Omit<ImageMount, "type" | "source"> = {},
  ): PartialMountSettings {
    return {
      Type: "image",
      Source: typeof source === "string" ? source : source.Id,
      Target: null,
      ReadOnly: props.readonly ? true : undefined,
      Consistency: props.consistency,
      ImageOptions: {
        Subpath: props.subPath,
      },
    };
  },
  Tmpfs(props: Omit<TmpfsMount, "type"> = {}): PartialMountSettings {
    return {
      Type: "tmpfs",
      Target: null,
      ReadOnly: props.readonly ? true : undefined,
      Consistency: props.consistency,
      TmpfsOptions: {
        // @ts-expect-error - dockerode typing doesnt allow undefined
        SizeBytes:
          typeof props.size === "string" ? parseBytes(props.size) : props.size,
        // @ts-expect-error - dockerode typing doesnt allow undefined
        Mode: props.mode,
      },
    };
  },
};

export function isVolume(resource: any): resource is Volume {
  return resource && resource[ResourceKind] === "docker::api::Volume";
}

function getVolumeName(source: Volume | string): string {
  return typeof source === "string" ? source : source.Name;
}
