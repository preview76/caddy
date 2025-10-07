import { MenuBarExtra, Icon, open, Color, environment, showToast, Toast } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { exec } from "child_process";
import { promisify } from "util";
import {
  getCaddyStatus,
  getCaddyConfig,
  parseConfigRoutes,
  checkRoutesReachability,
  startCaddy,
  stopCaddy,
  restartCaddy,
} from "./utils";

const execAsync = promisify(exec);

export default function Command() {
  const {
    data: status,
    isLoading: statusLoading,
    revalidate: revalidateStatus,
  } = useCachedPromise(getCaddyStatus, [], {
    initialData: { isRunning: false },
  });

  const {
    data: config,
    isLoading: configLoading,
    revalidate: revalidateConfig,
  } = useCachedPromise(getCaddyConfig, [], {
    initialData: null,
  });

  const baseRoutes = parseConfigRoutes(config);

  const {
    data: routes,
    isLoading: routesLoading,
    revalidate: revalidateRoutes,
  } = useCachedPromise(
    async () => {
      if (baseRoutes.length === 0) return [];
      return await checkRoutesReachability(baseRoutes);
    },
    [],
    {
      initialData: baseRoutes,
      execute: baseRoutes.length > 0,
    },
  );

  const isLoading = statusLoading || configLoading || routesLoading;

  const revalidate = async () => {
    await revalidateStatus();
    await revalidateConfig();
    await revalidateRoutes();
  };

  const icon = status.isRunning
    ? { source: Icon.CheckCircle, tintColor: Color.Green }
    : { source: Icon.XMarkCircle, tintColor: Color.Red };

  return (
    <MenuBarExtra
      icon={icon}
      title="Caddy"
      isLoading={isLoading}
      tooltip={status.isRunning ? "Caddy Running" : "Caddy Stopped"}
    >
      <MenuBarExtra.Section title="Status">
        <MenuBarExtra.Item title={status.isRunning ? "Running" : "Stopped"} icon={icon} />
        {status.pid && <MenuBarExtra.Item title={`PID: ${status.pid}`} icon={Icon.Terminal} />}
        {status.uptime && <MenuBarExtra.Item title={`Uptime: ${status.uptime}`} icon={Icon.Clock} />}
      </MenuBarExtra.Section>

      {routes && routes.length > 0 && (
        <MenuBarExtra.Section title="Configured Sites">
          {routes.map((route, index) => {
            const subtitle = route.proxyTarget ? `→ ${route.proxyTarget}` : undefined;

            // Show green dot if reachable, red if not, gray if unknown
            const statusIcon =
              route.isReachable === true
                ? { source: Icon.CircleFilled, tintColor: Color.Green }
                : route.isReachable === false
                  ? { source: Icon.CircleFilled, tintColor: Color.Red }
                  : { source: Icon.Circle, tintColor: Color.SecondaryText };

            return (
              <MenuBarExtra.Item
                key={index}
                title={route.host}
                subtitle={subtitle}
                icon={statusIcon}
                onAction={() => open(route.url)}
              />
            );
          })}
        </MenuBarExtra.Section>
      )}

      <MenuBarExtra.Section title="Actions">
        {!status.isRunning && (
          <MenuBarExtra.Item
            title="Start Caddy"
            icon={Icon.Play}
            onAction={async () => {
              const toast = await showToast({
                style: Toast.Style.Animated,
                title: "Starting Caddy...",
              });
              const result = await startCaddy();
              if (result.success) {
                toast.style = Toast.Style.Success;
                toast.title = "Caddy Started";
              } else {
                toast.style = Toast.Style.Failure;
                toast.title = "Failed to Start";
                toast.message = result.message;
              }
              setTimeout(() => revalidate(), 500);
            }}
          />
        )}
        {status.isRunning && (
          <MenuBarExtra.Item
            title="Stop Caddy"
            icon={Icon.Stop}
            onAction={async () => {
              const toast = await showToast({
                style: Toast.Style.Animated,
                title: "Stopping Caddy...",
              });
              const result = await stopCaddy();
              if (result.success) {
                toast.style = Toast.Style.Success;
                toast.title = "Caddy Stopped";
              } else {
                toast.style = Toast.Style.Failure;
                toast.title = "Failed to Stop";
                toast.message = result.message;
              }
              setTimeout(() => revalidate(), 500);
            }}
          />
        )}
        {status.isRunning && (
          <MenuBarExtra.Item
            title="Restart Caddy"
            icon={Icon.ArrowClockwise}
            onAction={async () => {
              const toast = await showToast({
                style: Toast.Style.Animated,
                title: "Restarting Caddy...",
              });
              const result = await restartCaddy();
              if (result.success) {
                toast.style = Toast.Style.Success;
                toast.title = "Caddy Restarted";
              } else {
                toast.style = Toast.Style.Failure;
                toast.title = "Failed to Restart";
                toast.message = result.message;
              }
              setTimeout(() => revalidate(), 1000);
            }}
          />
        )}
        <MenuBarExtra.Item
          title="Edit Config in Cursor"
          icon={Icon.Code}
          onAction={async () => {
            try {
              const configPath = `${environment.HOME}/Library/Application Support/Caddy/autosave.json`;
              await execAsync(`open -a Cursor "${configPath}"`);
            } catch (error) {
              await showToast({
                style: Toast.Style.Failure,
                title: "Failed to open Cursor",
                message: String(error),
              });
            }
          }}
        />
        <MenuBarExtra.Item
          title="Edit Config in TextEdit"
          icon={Icon.Document}
          onAction={async () => {
            try {
              const configPath = `${environment.HOME}/Library/Application Support/Caddy/autosave.json`;
              await execAsync(`open -a TextEdit "${configPath}"`);
            } catch (error) {
              await showToast({
                style: Toast.Style.Failure,
                title: "Failed to open TextEdit",
                message: String(error),
              });
            }
          }}
        />
        <MenuBarExtra.Item
          title="Show Config in Finder"
          icon={Icon.Finder}
          onAction={async () => {
            try {
              const configPath = `${environment.HOME}/Library/Application Support/Caddy/autosave.json`;
              await execAsync(`open -R "${configPath}"`);
            } catch (error) {
              await showToast({
                style: Toast.Style.Failure,
                title: "Failed to open Finder",
                message: String(error),
              });
            }
          }}
        />
      </MenuBarExtra.Section>

      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title="Refresh Status"
          icon={Icon.ArrowClockwise}
          onAction={revalidate}
          shortcut={{ modifiers: ["cmd"], key: "r" }}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
