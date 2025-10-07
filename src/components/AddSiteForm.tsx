import { Form, Action, ActionPanel, showToast, Toast, popToRoot, open, Icon } from "@raycast/api";
import { useEffect } from "react";
import { exec } from "child_process";
import { promisify } from "util";
import { useForm } from "@raycast/utils";
import { useCachedPromise } from "@raycast/utils";
import { promises as fs } from "fs";
import { getCaddyConfig, parseConfigRoutes, restartCaddy } from "../utils";

const execAsync = promisify(exec);

interface AddSiteFormProps {
  onSiteAdded?: () => Promise<void>;
}

interface FormValues {
  projectPath: string[];
  domain: string;
  port: string;
}

export default function AddSiteForm({ onSiteAdded }: AddSiteFormProps) {
  console.log("📝 ADD SITE FORM RENDERED");

  // Get existing routes to check for conflicts
  const { data: config } = useCachedPromise(getCaddyConfig, [], {
    initialData: null,
  });

  const existingRoutes = parseConfigRoutes(config);

  const { handleSubmit, itemProps, values, setValue } = useForm<FormValues>({
    async onSubmit(values) {
      await handleFormSubmit(values);
    },
    validation: {
      domain: (value) => {
        if (!value || value.length === 0) {
          return "Domain is required";
        } else if (!value.includes(".") && !value.includes("localhost")) {
          return "Invalid domain format";
        }
        // Check if domain already exists
        const domainExists = existingRoutes.some((route) => route.host === value?.trim());
        if (domainExists) {
          return "Domain already exists";
        }
      },
      port: (value) => {
        if (!value || value.length === 0) {
          return "Port is required";
        }
        const portNum = parseInt(value || "");
        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
          return "Port must be between 1 and 65535";
        }
        // Check if port already in use
        const portInUse = existingRoutes.some((route) => {
          const targetPort = route.proxyTarget?.split(":")[1];
          return targetPort === value?.trim();
        });
        if (portInUse) {
          return "Port already in use by another site";
        }
      },
    },
  });

  // Watch for project path changes and auto-fill
  useEffect(() => {
    const paths = values.projectPath;
    if (!paths || paths.length === 0) return;

    const path = paths[0];
    console.log("🟢 Selected path:", path);

    // Extract folder name and auto-fill domain
    const folderName = path.split("/").pop() || "";
    const suggestedDomain = `${folderName}.localhost`;
    console.log("🏷️ Auto-filling domain:", suggestedDomain);
    setValue("domain", suggestedDomain);

    // Read PORT from .env
    (async () => {
      try {
        const envPath = `${path}/.env`;
        console.log("🔍 Looking for .env at:", envPath);

        const { stdout } = await execAsync(`cat "${envPath}" 2>/dev/null`);
        console.log("📄 .env contents:", stdout);

        if (stdout && stdout.trim()) {
          const portMatch = stdout.match(/PORT\s*=\s*(\d+)/);
          console.log("🔍 PORT match result:", portMatch);

          if (portMatch && portMatch[1]) {
            const foundPort = portMatch[1];
            console.log("✅ Found PORT:", foundPort);
            setValue("port", foundPort);

            await showToast({
              style: Toast.Style.Success,
              title: "Auto-filled from .env",
              message: `${suggestedDomain} → PORT ${foundPort}`,
            });
          }
        }
      } catch (error) {
        console.log("❌ Error reading .env:", error);
      }
    })();
  }, [values.projectPath]);

  async function handleFormSubmit(values: FormValues) {
    if (!values.projectPath || values.projectPath.length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Project folder is required",
      });
      return;
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Adding site to Caddy...",
    });

    const selectedProjectPath = values.projectPath[0];
    const domain = values.domain.trim();
    const port = values.port.trim();

    try {
      // Update .env
      toast.message = "Updating .env file...";
      await updateEnvFile(selectedProjectPath, port);

      // Add site to Caddy
      toast.message = "Adding to Caddy config...";
      await addSiteToCaddy(domain, port);

      // Show success immediately
      toast.style = Toast.Style.Success;
      toast.title = "✅ Site Added!";
      toast.message = `${domain} → localhost:${port}`;

      // Refresh the list if callback provided BEFORE going back
      if (onSiteAdded) {
        await onSiteAdded();
      }

      // Go back to the list
      popToRoot();

      // Try to restart Caddy in the background
      (async () => {
        const restartToast = await showToast({
          style: Toast.Style.Animated,
          title: "Restarting Caddy...",
        });

        try {
          const restartResult = await restartCaddy();

          if (restartResult.success) {
            restartToast.style = Toast.Style.Success;
            restartToast.title = "Caddy Restarted";
            restartToast.message = "Site is now live!";

            // Open in browser
            setTimeout(() => {
              const protocol = domain.includes("localhost") ? "http" : "https";
              open(`${protocol}://${domain}`);
            }, 500);
          } else {
            restartToast.style = Toast.Style.Failure;
            restartToast.title = "Restart failed";
            restartToast.message = "Restart Caddy from menu bar";
          }
        } catch {
          restartToast.style = Toast.Style.Failure;
          restartToast.title = "Restart failed";
          restartToast.message = "Restart Caddy from menu bar";
        }
      })();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to add site";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  const generateRandomPort = () => {
    // Generate random port between 3000-9999
    const randomPort = Math.floor(Math.random() * 7000) + 3000;
    setValue("port", randomPort.toString());
    showToast({
      style: Toast.Style.Success,
      title: "Random port generated",
      message: `Port: ${randomPort}`,
    });
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add Site" onSubmit={handleSubmit} />
          <Action
            title="Generate Random Port"
            icon={Icon.Shuffle}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={generateRandomPort}
          />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        {...itemProps.projectPath}
        title="Project Folder"
        allowMultipleSelection={false}
        canChooseDirectories={true}
        canChooseFiles={false}
      />
      <Form.TextField {...itemProps.domain} title="Domain" placeholder="myapp.localhost" />
      <Form.TextField {...itemProps.port} title="Port" placeholder="3000" info="Or press ⌘R for random port" />
    </Form>
  );
}

async function updateEnvFile(projectPath: string, port: string): Promise<void> {
  const envPath = `${projectPath}/.env`;

  try {
    await execAsync(`test -f "${envPath}"`);
    const { stdout: currentEnv } = await execAsync(`cat "${envPath}"`);

    if (currentEnv.includes("PORT=")) {
      await execAsync(`sed -i '' 's/PORT=.*/PORT=${port}/' "${envPath}"`);
    } else {
      await execAsync(`echo "\nPORT=${port}" >> "${envPath}"`);
    }
  } catch {
    await execAsync(`echo "PORT=${port}" > "${envPath}"`);
  }
}

async function addSiteToCaddy(domain: string, port: string): Promise<void> {
  const configPath = `${process.env.HOME}/Library/Application Support/Caddy/autosave.json`;

  const configStr = await fs.readFile(configPath, "utf-8");
  const config = JSON.parse(configStr);

  const newRoute = {
    match: [{ host: [domain] }],
    handle: [
      {
        handler: "subroute",
        routes: [
          {
            handle: [
              {
                handler: "headers",
                response: {
                  set: {
                    "Referrer-Policy": ["strict-origin-when-cross-origin"],
                    "X-Content-Type-Options": ["nosniff"],
                    "X-Frame-Options": ["SAMEORIGIN"],
                  },
                },
              },
              {
                handler: "encode",
                encodings: { gzip: {}, zstd: {} },
                prefer: ["gzip", "zstd"],
              },
            ],
          },
          {
            match: [
              {
                path: ["*.ico", "*.css", "*.js", "*.gif", "*.jpg", "*.jpeg", "*.png", "*.svg", "*.woff", "*.woff2"],
              },
            ],
            handle: [
              {
                handler: "subroute",
                routes: [
                  {
                    handle: [
                      {
                        handler: "headers",
                        response: { set: { "Cache-Control": ["public, max-age=31536000, immutable"] } },
                      },
                      {
                        handler: "reverse_proxy",
                        upstreams: [{ dial: `127.0.0.1:${port}` }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            handle: [
              {
                handler: "subroute",
                routes: [
                  {
                    handle: [
                      {
                        handler: "reverse_proxy",
                        upstreams: [{ dial: `127.0.0.1:${port}` }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    terminal: true,
  };

  if (!config.apps?.http?.servers?.srv0) {
    throw new Error("Invalid Caddy config structure");
  }

  if (!config.apps.http.servers.srv0.routes) {
    config.apps.http.servers.srv0.routes = [];
  }

  config.apps.http.servers.srv0.routes.push(newRoute);

  const tempPath = `${configPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(config), "utf-8");
  await fs.rename(tempPath, configPath);
}
