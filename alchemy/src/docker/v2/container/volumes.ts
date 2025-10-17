import type Dockerode from "dockerode";
import path from "node:path";
import type { DockerHost } from "../docker-host.ts";
import { Image, isImage } from "../image.ts";
import { isVolume, Mount, Volume } from "../volume.ts";
import type { ContainerProps } from "./types.ts";

export type PartialMountSettings = Omit<
  Dockerode.MountSettings,
  "Source" | "Target"
> & {
  Source: string | Volume | Image;
  Target: null;
};

export type VolumeMountDefinition =
  | string
  | Volume
  | Image
  | Dockerode.MountSettings
  | PartialMountSettings
  | VolumeMount
  | BindMount
  | ImageMount;

interface MountBaseProps {
  /**
   * Whether to mount the volume as read-only.
   */
  readonly?: boolean;
  consistency?: "default" | "consistent" | "cached" | "delegated";
}

export interface VolumeMount extends MountBaseProps {
  type: "volume";
  source: string | Volume;

  /**
   * Populate volume with the existing data on the container's target path.
   * Disable if you want to mount the volume empty and disregard any existing data.
   *
   * @default true
   */
  copy?: boolean;

  /**
   * Labels to apply to the volume.
   */
  labels?: Record<string, string>;

  /**
   * Path to a subdirectory inside the volume to mount.
   */
  subPath?: string;

  /**
   * Name of the volume driver to use.
   */
  driverName?: string;

  /**
   * Driver-specific options.
   */
  driverOptions?: Record<string, string>;
}

export type VolumePropagation =
  | "private"
  | "rprivate"
  | "shared"
  | "rshared"
  | "slave"
  | "rslave";

export interface BindMount extends MountBaseProps {
  type: "bind";
  source: string;

  /**
   * Propagation mode for the volume.
   */
  propagation?: VolumePropagation;

  /**
   * Disable recursive bind mount.
   * @default false
   */
  nonRecursive?: boolean;

  /**
   * Make the mount non-recursively read-only, but still leave the mount
   * recursive (unless NonRecursive is set to true in conjunction).
   *
   * Added in v1.44, before that version all read-only mounts were non-recursive
   * by default. To match the previous behaviour this will default to `true` for
   * clients on versions prior to v1.44.
   * @default false
   */
  readonlyNonRecursive?: boolean;

  /**
   * Raise an error if the mount cannot be made recursively read-only.
   * @default false
   */
  readonlyForceRecursive?: boolean;

  /**
   * Creates the mount point on the host if it doesn't exist.
   * @default false
   */
  create?: boolean;
}

export interface ImageMount extends MountBaseProps {
  type: "image";

  /**
   * Image to mount
   */
  source: string | Image;

  /**
   * Path to a subdirectory inside the image to mount.
   */
  subPath?: string;
}

export interface TmpfsMount extends MountBaseProps {
  type: "tmpfs";

  /**
   * The size of the tmpfs mount in bytes.
   * Can be a number or a string with a unit.
   * @example "1gb", "1024mb", 1024 * 1024 * 1024
   */
  size?: number | string;

  /**
   * The permission mode for the tmpfs mount in an integer.
   */
  mode?: number;
}

export async function parseVolumeMounts(
  volumes: ContainerProps["volumes"],
  dockerHost: DockerHost,
): Promise<Dockerode.HostConfig["Mounts"]> {
  const mounts: Dockerode.HostConfig["Mounts"] = [];

  for (let [target, source] of Object.entries(volumes ?? {})) {
    if (typeof source === "string") {
      if (!source.startsWith("/") && !source.startsWith("./")) {
        throw new Error(
          `Invalid volume source: ${JSON.stringify(source)}. Bind mounts must start with / or ./, if you want to mount a volume, use the Volume resource or the Mount.* helpers.`,
        );
      }

      if (source.startsWith("./")) {
        source = path.resolve(source);
      }

      mounts.push({
        ...Mount.Bind(source),
        Source: source,
        Target: target,
      });
    } else if (isVolume(source)) {
      mounts.push({
        ...Mount.Volume(source),
        Source: source.Name,
        Target: target,
      });
    } else if (isImage(source)) {
      mounts.push({
        ...Mount.Image(source),
        Source: source.Id,
        Target: target,
      });
    } else if ("Type" in source) {
      if (source.Type === "volume") {
        if (!isVolume(source.Source) && typeof source.Source !== "string") {
          throw new Error(
            `Invalid volume source: ${JSON.stringify(source)}. Volume source must be a string or a Volume resource.`,
          );
        }

        let sourceName: string | null =
          typeof source.Source === "string"
            ? (await Volume(source.Source)).Name
            : source.Source.Name;

        if (!sourceName) {
          throw new Error(
            `Invalid volume source: ${JSON.stringify(source)}. Volume name is required for volume mounts.`,
          );
        }

        mounts.push({
          ...source,
          Source: sourceName,
          Target: source.Target ?? target,
        });
      } else if (source.Type === "bind") {
        if (typeof source.Source !== "string") {
          throw new Error(
            `Invalid volume source: ${JSON.stringify(source)}. Bind mounts must have a string source.`,
          );
        }

        if (source.Source.startsWith("./")) {
          source.Source = path.resolve(source.Source);
        }

        mounts.push({
          ...source,
          Source: source.Source,
          Target: source.Target ?? target,
        });
      } else if (source.Type === "image") {
        if (!isImage(source.Source) && typeof source.Source !== "string") {
          throw new Error(
            `Invalid image source: ${JSON.stringify(source)}. Image source must be a string or an Image resource.`,
          );
        }

        const imageRef =
          typeof source.Source === "string"
            ? // We need to prevent name collisions with possible volume names,
              // I THINK this is the best way while leaving the id readable.
              await Image(
                `volume.${target.replaceAll(/[^a-z0-9_-]/gi, "_")}.img`,
                {
                  ref: source.Source,
                  dockerHost,
                },
              ).then((image) => image.Id)
            : source.Source.Id;

        mounts.push({
          ...source,
          Source: imageRef,
          Target: source.Target ?? target,
        });
      } else if (source.Type === "tmpfs") {
        mounts.push({
          ...source,
          Source: "",
          Target: source.Target ?? target,
        });
      }
    } else {
      throw new Error(`Invalid volume source: ${JSON.stringify(source)}`);
    }
  }

  return mounts;
}
