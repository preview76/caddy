import { List, Action, ActionPanel, Icon, Color } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { getCaddyStatus, getCaddyConfig, parseConfigRoutes, checkRoutesReachability } from "./utils";

export default function Command() {
  const { data: status, isLoading: statusLoading } = useCachedPromise(getCaddyStatus, [], {
    initialData: { isRunning: false },
  });

  const { data: config, isLoading: configLoading } = useCachedPromise(getCaddyConfig, [], {
    initialData: null,
  });

  const baseRoutes = parseConfigRoutes(config);

  const { data: routes, isLoading: routesLoading } = useCachedPromise(
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

  return (
    <List isLoading={isLoading}>
      <List.Section title="Status">
        <List.Item
          title={status.isRunning ? "Running" : "Stopped"}
          subtitle={status.pid ? `PID: ${status.pid}` : undefined}
          icon={
            status.isRunning
              ? { source: Icon.CheckCircle, tintColor: Color.Green }
              : { source: Icon.XMarkCircle, tintColor: Color.Red }
          }
          accessories={status.uptime ? [{ text: `Uptime: ${status.uptime}` }] : []}
        />
      </List.Section>

      {routes && routes.length > 0 && (
        <List.Section title="Configured Sites" subtitle={`${routes.length} site${routes.length === 1 ? "" : "s"}`}>
          {routes.map((route, index) => {
            const accessories = [];

            if (route.proxyTarget) {
              accessories.push({ text: `→ ${route.proxyTarget}` });
            }

            // Add status indicator
            if (route.isReachable === true) {
              accessories.push({
                tag: { value: "Running", color: Color.Green },
                icon: { source: Icon.CircleFilled, tintColor: Color.Green },
              });
            } else if (route.isReachable === false) {
              accessories.push({
                tag: { value: "Stopped", color: Color.Red },
                icon: { source: Icon.CircleFilled, tintColor: Color.Red },
              });
            }

            return (
              <List.Item
                key={index}
                title={route.host}
                subtitle={route.url}
                icon={Icon.Globe}
                accessories={accessories}
                actions={
                  <ActionPanel>
                    <Action.OpenInBrowser title="Open in Browser" url={route.url} />
                    <Action.CopyToClipboard title="Copy URL" content={route.url} />
                    <Action.CopyToClipboard title="Copy Domain" content={route.host} />
                    {route.proxyTarget && (
                      <Action.CopyToClipboard title="Copy Proxy Target" content={route.proxyTarget} />
                    )}
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}

      {!routes ||
        (routes.length === 0 && !isLoading && (
          <List.EmptyView
            title="No Configuration Found"
            description="Could not find Caddy configuration"
            icon={Icon.ExclamationMark}
          />
        ))}
    </List>
  );
}
