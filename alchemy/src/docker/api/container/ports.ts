import type { ContainerProps } from "./types.ts";

export function parsePortBindings(
  ports: ContainerProps["ports"],
): Record<string, { HostPort: string; HostIp: string }[]> | null {
  return Array.isArray(ports)
    ? Object.fromEntries(
        ports.map((port) => [
          port,
          [
            {
              HostPort: "",
              HostIp: "",
            },
          ],
        ]),
      )
    : ports && typeof ports === "object"
      ? Object.entries(ports).reduce(
          (acc, [containerPort, hostPort]) => {
            if (!containerPort.includes("/")) {
              containerPort = `${containerPort}/tcp`;
            }

            const parseHostBinding = (hostPort: string | number) => {
              const hostSplit = `${hostPort}`.split(":");
              const parsedHostIp =
                hostSplit.length > 1 ? hostSplit.slice(0, -1).join(":") : "";
              const parsedHostPort =
                hostSplit.length > 1 ? hostSplit.slice(-1)[0] : `${hostPort}`;

              if (!parsedHostPort) {
                throw new Error(`Invalid host port: "${hostPort}"`);
              }

              return { HostPort: parsedHostPort, HostIp: parsedHostIp };
            };
            acc[containerPort] ??= [];
            if (Array.isArray(hostPort)) {
              acc[containerPort].push(...hostPort.map(parseHostBinding));
            } else if (
              typeof hostPort === "string" ||
              typeof hostPort === "number"
            ) {
              acc[containerPort].push(parseHostBinding(hostPort));
            } else if (hostPort === true) {
              acc[containerPort].push({ HostPort: "", HostIp: "" });
            } else {
              throw new Error(`Invalid host port: "${hostPort}"`);
            }

            return acc;
          },
          {} as Record<string, { HostPort: string; HostIp: string }[]>,
        )
      : null;
}
