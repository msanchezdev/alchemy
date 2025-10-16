import type Dockerode from "dockerode";
import type { ContainerCreateOptions } from "dockerode";
import type {
  Context,
  CreateContext,
  UpdateContext,
} from "../../../context.ts";
import { Resource } from "../../../resource.ts";
import { logger } from "../../../util/logger.ts";
import { DockerHost } from "../docker-host.ts";
import type { DockerRegistry } from "../docker-registry.ts";
import { Image } from "../image.ts";
import { hasContainerChanged } from "./changes.ts";
import { parseHealthcheck } from "./healthcheck.ts";
import { parseNetworkMode, reconcileNetworks } from "./networking.ts";
import { parsePortBindings } from "./ports.ts";
import type { ContainerProps } from "./types.ts";
import {
  cleanTempOrphans,
  mergeEnv,
  normalizeName,
  parseRestartPolicy,
} from "./utils.ts";

/**
 * Docker Container resource
 */
export interface Container
  extends Resource<"docker::api::Container">,
    Dockerode.ContainerInspectInfo {}

/**
 * Create and manage a Docker Image
 */
export const Container = Resource(
  "docker::api::Container",
  {
    alwaysUpdate: true,
  },
  async function (
    this: Context<Container, ContainerProps>,
    id: string,
    props: ContainerProps,
  ): Promise<Container> {
    // Initialize Docker API client
    const dockerHost = await DockerHost<Record<string, DockerRegistry>>(
      props.dockerHost,
    );
    const { dockerode: api } = dockerHost;

    const imageRef =
      typeof props.image === "string"
        ? await Image("image", {
            ref: props.image,
            dockerHost,
          }).then((image) => image.Id)
        : props.image.Id;
    const imageDefaults = await api.getImage(imageRef).inspect();

    const containerName = normalizeName(
      props.name ?? this.output?.Name ?? this.scope.createPhysicalName(id),
    );

    let existingContainer = api.getContainer(this.output?.Id ?? containerName);
    const existingContainerDetails = await existingContainer
      .inspect()
      .catch((err) => {
        const reason = "reason" in err ? err.reason : err;
        if (reason === "no such container") {
          return null;
        }
        throw err;
      });

    const expectedContainer: ContainerCreateOptions & { name: string } = {
      name: containerName,
      Image: imageRef,
      User: props.user ?? imageDefaults.Config.User,
      Cmd: props.command ?? imageDefaults.Config.Cmd,
      Entrypoint: props.entrypoint ?? imageDefaults.Config.Entrypoint,
      Healthcheck: parseHealthcheck(props.healthcheck, imageDefaults),
      Hostname: props.hostname,
      Domainname: props.domain || "",
      WorkingDir: props.cwd ?? imageDefaults.Config.WorkingDir,
      Env: mergeEnv(props.environment, imageDefaults.Config.Env),
      Labels: {
        ...imageDefaults.Config.Labels,
        ...props.labels,
      },
      ExposedPorts: {
        ...imageDefaults?.Config?.ExposedPorts,
        ...(Array.isArray(props.ports)
          ? Object.fromEntries(
              props.ports.map((port) => [
                `${port}`.includes("/") ? port : `${port}/tcp`,
                {},
              ]),
            )
          : typeof props.ports === "object"
            ? Object.fromEntries(
                Object.keys(props.ports).map((containerPort) => [
                  `${containerPort}`.includes("/")
                    ? containerPort
                    : `${containerPort}/tcp`,
                  {},
                ]),
              )
            : {}),
      },
      HostConfig: {
        NetworkMode: parseNetworkMode(props.networking),
        PortBindings: parsePortBindings(props.ports),
        PublishAllPorts: props.ports === true,
        RestartPolicy: parseRestartPolicy(props.restart),
      },
      NetworkingConfig: {
        EndpointsConfig:
          typeof props.networking === "object"
            ? Object.fromEntries(
                Object.entries(props.networking).map(([network, config]) => [
                  network,
                  {
                    Aliases: config.aliases,
                    MacAddress: config.macAddress,
                    DriverOpts: config.driverOpts,
                    GwPriority: config.priority,
                    IPAMConfig: {
                      IPv4Address: config.ipv4,
                      IPv6Address: config.ipv6,
                      LinkLocalIPs: config.linkLocalIPs,
                    },
                  } as Dockerode.EndpointSettings,
                ]),
              )
            : {},
      },
    };

    await cleanTempOrphans({
      api,
      id,
      fqn: this.fqn,
      expected: expectedContainer,
    });

    const changes = await hasContainerChanged(
      existingContainerDetails,
      expectedContainer,
      this.props,
      props,
      api,
    );

    if (this.phase === "delete") {
      if (!existingContainerDetails) {
        return this.destroy();
      }

      if (existingContainerDetails.State.Running) {
        logger.task(id, {
          prefix: "stopping",
          prefixColor: "redBright",
          resource: id,
          message: "Stopping Container",
          status: "pending",
        });
        await existingContainer.stop();
      }

      if (!props.keep) {
        logger.task(id, {
          prefix: "deleting",
          prefixColor: "redBright",
          resource: id,
          message: "Deleting Container",
          status: "pending",
        });
        await existingContainer.remove();
      }

      return this.destroy();
    }

    if (this.phase === "update" && existingContainerDetails) {
      if (changes === "soft") {
        if (
          normalizeName(existingContainerDetails.Name) !==
          expectedContainer.name
        ) {
          logger.task(id, {
            prefix: "renaming",
            prefixColor: "yellowBright",
            resource: id,
            message: `Renaming Container from ${normalizeName(existingContainerDetails.Name)} to ${expectedContainer.name}`,
            status: "pending",
          });
          await existingContainer.rename({ name: expectedContainer.name });
        }

        await reconcile({
          props,
          api,
          resource: this,
          before: existingContainer,
          after: existingContainer,
          expected: expectedContainer,
        });

        return this(await existingContainer.inspect());
      }

      if (changes === "hard") {
        // First attempt to create the container, to catch errors early
        const createdContainer = await recreateContainer({
          id,
          fqn: this.fqn,
          api,
          container: existingContainer,
          expected: expectedContainer,
          status: props.status,
        });
        await reconcile({
          props,
          api,
          resource: this,
          before: existingContainer,
          after: createdContainer,
          expected: expectedContainer,
        });
        return this(await createdContainer.inspect());
      }
    }

    // If there was no change but the container exists we reconcile it
    if (existingContainerDetails) {
      await reconcile({
        props,
        api,
        resource: this,
        before: existingContainer,
        after: existingContainer,
        expected: expectedContainer,
      });

      return this(await existingContainer.inspect());
    }

    logger.task(this.fqn, {
      prefix: "creating",
      prefixColor: "yellowBright",
      resource: id,
      message: "Creating Container",
      status: "pending",
    });

    // attempt to remove the container if the process exits unexpectedly
    process.once("uncaughtException", async (err) => {
      await api
        .getContainer(expectedContainer.name)
        .remove()
        .catch(() => {});
      throw err;
    });

    const createdContainer = await api.createContainer(expectedContainer);
    await reconcile({
      props,
      api,
      resource: this,
      before: existingContainer,
      after: createdContainer,
      expected: expectedContainer,
    });
    return this(await createdContainer.inspect());
  },
);

async function recreateContainer(opts: {
  id: string;
  fqn: string;
  api: Dockerode;
  container: Dockerode.Container;
  expected: ContainerCreateOptions & { name: string };
  status: ContainerProps["status"];
}) {
  const { id, fqn, api, container, expected, status } = opts;

  const details = await container.inspect();

  logger.task(fqn, {
    prefix: "creating",
    prefixColor: "yellowBright",
    resource: id,
    message: "Creating new container",
    status: "pending",
  });
  const createdContainer = await api.createContainer({
    ...expected,
    name: `${expected.name.slice(0, 30)}-${Date.now()}`,
  });

  if (details.State.Running) {
    logger.task(fqn, {
      prefix: "stopping",
      prefixColor: "redBright",
      resource: id,
      message: "Stopping old container",
      status: "pending",
    });
    await container.stop();
  }

  await ensureState({
    id,
    container: createdContainer,
    status,
  });

  logger.task(fqn, {
    prefix: "removing",
    prefixColor: "redBright",
    resource: id,
    message: "Removing old container",
    status: "pending",
  });
  await container.remove();
  await createdContainer.rename({ name: expected.name });
  return createdContainer;
}

async function reconcile(opts: {
  resource: CreateContext<Container> | UpdateContext<Container, ContainerProps>;
  props: ContainerProps;
  api: Dockerode;
  before: Dockerode.Container;
  after: Dockerode.Container;
  expected: ContainerCreateOptions & { name: string };
}) {
  const { resource, props, api, after } = opts;

  await reconcileNetworks({
    id: resource.id,
    fqn: resource.fqn,
    api,
    container: after,
    props,
  });

  await ensureState({
    id: resource.id,
    container: after,
    status: props.status,
  });
}

async function ensureState(opts: {
  id: string;
  container: Dockerode.Container;
  status: ContainerProps["status"];
}) {
  const { id, container, status } = opts;
  const details = await container.inspect();

  if (status === "stopped" && details.State.Running) {
    logger.task(id, {
      prefix: "stopping",
      prefixColor: "redBright",
      resource: id,
      message: "Stopping Container",
      status: "pending",
    });
    await container.stop();
    return;
  }

  // running or paused must start the container
  if (status !== "stopped" && !details.State.Running) {
    logger.task(id, {
      prefix: "starting",
      prefixColor: "greenBright",
      resource: id,
      message: "Starting Container",
      status: "pending",
    });
    await container.start();
  }

  if (status === "paused" && !details.State.Paused) {
    logger.task(id, {
      prefix: "pausing",
      prefixColor: "yellowBright",
      resource: id,
      message: "Pausing Container",
      status: "pending",
    });
    await container.pause();
  }

  if (status === "running" && details.State.Paused) {
    logger.task(id, {
      prefix: "unpausing",
      prefixColor: "yellowBright",
      resource: id,
      message: "Unpausing Container",
      status: "pending",
    });

    await container.unpause();
  }
}
