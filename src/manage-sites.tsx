import { List, Action, ActionPanel, Icon, Color, confirmAlert, Alert, showToast, Toast } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { promises as fs } from "fs";
import { getCaddyStatus, getCaddyConfig, parseConfigRoutes, checkRoutesReachability, restartCaddy } from "./utils";
import AddSiteForm from "./components/AddSiteForm";

export default function Command() {
  console.log("🚀 MANAGE SITES COMMAND STARTED");

  const { isLoading: statusLoading } = useCachedPromise(getCaddyStatus, [], {
    initialData: { isRunning: false },
  });

  const {
    data: config,
    isLoading: configLoading,
    revalidate: revalidateConfig,
  } = useCachedPromise(getCaddyConfig, [], {
    initialData: null,
    keepPreviousData: false,
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
    await revalidateConfig();
    await revalidateRoutes();
  };

  const deleteSite = async (domain: string) => {
    const confirmed = await confirmAlert({
      title: "Delete Site",
      message: `Are you sure you want to delete "${domain}"?`,
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!confirmed) return;

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Deleting site...",
    });

    try {
      const configPath = `${process.env.HOME}/Library/Application Support/Caddy/autosave.json`;

      // Read config
      const configStr = await fs.readFile(configPath, "utf-8");
      const parsedConfig = JSON.parse(configStr);

      // Remove all routes matching this domain
      if (parsedConfig.apps?.http?.servers?.srv0?.routes) {
        parsedConfig.apps.http.servers.srv0.routes = parsedConfig.apps.http.servers.srv0.routes.filter(
          (route: { match?: Array<{ host?: string[] }> }) => {
            const hosts = route.match?.[0]?.host;
            return !hosts || !hosts.includes(domain);
          },
        );
      }

      // Write back
      await fs.writeFile(configPath, JSON.stringify(parsedConfig), "utf-8");

      // Restart Caddy
      const restartResult = await restartCaddy();

      if (restartResult.success) {
        toast.style = Toast.Style.Success;
        toast.title = "Site deleted";
        toast.message = domain;
        await revalidate();
      } else {
        throw new Error(restartResult.message);
      }
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to delete site";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  };

  return (
    <List isLoading={isLoading}>
      <List.Section title="Caddy Sites" subtitle={`${routes?.length || 0} site${routes?.length === 1 ? "" : "s"}`}>
        {routes &&
          routes.map((route, index) => {
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
                    <ActionPanel.Section title="Site Actions">
                      <Action.OpenInBrowser title="Open in Browser" url={route.url} />
                      <Action.Push
                        title="Add New Site"
                        icon={Icon.Plus}
                        shortcut={{ modifiers: ["cmd"], key: "n" }}
                        target={<AddSiteForm onSiteAdded={revalidate} />}
                      />
                    </ActionPanel.Section>
                    <ActionPanel.Section title="Copy">
                      <Action.CopyToClipboard title="Copy URL" content={route.url} />
                      <Action.CopyToClipboard title="Copy Domain" content={route.host} />
                      {route.proxyTarget && (
                        <Action.CopyToClipboard title="Copy Proxy Target" content={route.proxyTarget} />
                      )}
                    </ActionPanel.Section>
                    <ActionPanel.Section title="Danger Zone">
                      <Action
                        title="Delete Site"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        shortcut={{ modifiers: ["ctrl"], key: "x" }}
                        onAction={() => deleteSite(route.host)}
                      />
                    </ActionPanel.Section>
                  </ActionPanel>
                }
              />
            );
          })}
      </List.Section>

      {(!routes || routes.length === 0) && !isLoading && (
        <List.EmptyView
          title="No Sites Configured"
          description="Press ⌘N to add your first site"
          icon={Icon.Globe}
          actions={
            <ActionPanel>
              <Action.Push
                title="Add New Site"
                icon={Icon.Plus}
                shortcut={{ modifiers: ["cmd"], key: "n" }}
                target={<AddSiteForm onSiteAdded={revalidate} />}
              />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
