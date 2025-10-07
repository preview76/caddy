import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Set up proper PATH for Homebrew
const HOMEBREW_PATH = "/opt/homebrew/bin:/usr/local/bin";
const ENV_PATH = `${HOMEBREW_PATH}:${process.env.PATH || "/usr/bin:/bin:/usr/sbin:/sbin"}`;

// Wrapper for exec with proper environment
async function execWithEnv(command: string) {
  return execAsync(command, {
    env: { ...process.env, PATH: ENV_PATH },
  });
}

// Caddy binary paths
const CADDY_PATHS = [
  "/opt/homebrew/bin/caddy", // Apple Silicon
  "/usr/local/bin/caddy", // Intel
  "caddy", // Fallback to PATH
];

async function getCaddyBinary(): Promise<string> {
  for (const path of CADDY_PATHS) {
    try {
      await execWithEnv(`test -x ${path}`);
      return path;
    } catch {
      continue;
    }
  }
  return "caddy"; // Fallback
}

export interface CaddyStatus {
  isRunning: boolean;
  pid?: string;
  uptime?: string;
}

export interface CaddyConfig {
  apps?: {
    http?: {
      servers?: {
        [key: string]: {
          listen?: string[];
          routes?: Array<{
            match?: Array<{
              host?: string[];
            }>;
            handle?: Array<{
              handler?: string;
              root?: string;
              routes?: unknown[];
            }>;
          }>;
        };
      };
    };
  };
}

export interface CaddyRoute {
  host: string;
  port: string;
  url: string;
  proxyTarget?: string; // e.g., "127.0.0.1:3046"
  isReachable?: boolean;
}

/**
 * Check if Caddy is running
 */
export async function getCaddyStatus(): Promise<CaddyStatus> {
  try {
    const { stdout } = await execWithEnv("pgrep -l caddy");
    const lines = stdout.trim().split("\n");

    if (lines.length > 0 && lines[0]) {
      const [pid] = lines[0].split(" ");

      // Get uptime using ps
      try {
        const { stdout: uptimeOutput } = await execWithEnv(`ps -p ${pid} -o etime=`);
        const uptime = uptimeOutput.trim();

        return {
          isRunning: true,
          pid,
          uptime,
        };
      } catch {
        return {
          isRunning: true,
          pid,
        };
      }
    }

    return { isRunning: false };
  } catch {
    return { isRunning: false };
  }
}

/**
 * Start Caddy server with config from autosave.json
 */
export async function startCaddy(): Promise<{ success: boolean; message: string }> {
  try {
    const status = await getCaddyStatus();
    if (status.isRunning) {
      return { success: false, message: "Caddy is already running" };
    }

    const caddyBin = await getCaddyBinary();
    const configPath = `${process.env.HOME}/Library/Application Support/Caddy/autosave.json`;

    try {
      // Check if autosave.json exists
      try {
        await execWithEnv(`test -f "${configPath}"`);
        // Start with config from autosave.json
        await execWithEnv(`${caddyBin} start --config "${configPath}"`);
        return { success: true, message: "Caddy started with saved config" };
      } catch {
        // No config file, just start normally
        await execWithEnv(`${caddyBin} start`);
        return { success: true, message: "Caddy started (no config found)" };
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to start Caddy: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Stop Caddy server by killing the process (admin API is disabled)
 */
export async function stopCaddy(): Promise<{ success: boolean; message: string }> {
  try {
    const status = await getCaddyStatus();
    if (!status.isRunning) {
      return { success: false, message: "Caddy is not running" };
    }

    if (!status.pid) {
      return { success: false, message: "Could not find Caddy PID" };
    }

    try {
      // Kill the process by PID since admin API is disabled
      await execWithEnv(`kill ${status.pid}`);
      return { success: true, message: "Caddy stopped successfully" };
    } catch (error) {
      return {
        success: false,
        message: `Failed to stop Caddy: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Restart Caddy server - stop and start to reload config
 */
export async function restartCaddy(): Promise<{ success: boolean; message: string }> {
  try {
    const status = await getCaddyStatus();

    if (!status.isRunning) {
      // If not running, just start it
      return await startCaddy();
    }

    // Stop Caddy
    const stopResult = await stopCaddy();
    if (!stopResult.success) {
      return stopResult;
    }

    // Wait a moment for it to fully stop
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Start Caddy again with the updated config
    return await startCaddy();
  } catch (error) {
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get Caddy configuration from autosave.json or API
 */
export async function getCaddyConfig(): Promise<CaddyConfig | null> {
  // Try autosave.json first (most reliable for running config)
  try {
    const { stdout } = await execWithEnv(`cat "/Users/$(whoami)/Library/Application Support/Caddy/autosave.json"`);
    if (stdout) {
      return JSON.parse(stdout);
    }
  } catch {
    // Continue to other methods
  }

  // Try API endpoint
  try {
    const { stdout } = await execWithEnv("curl -s http://localhost:2019/config/");
    if (stdout) {
      return JSON.parse(stdout);
    }
  } catch {
    // Continue to Caddyfile
  }

  // Try Caddyfile adaptation
  try {
    const caddyBin = await getCaddyBinary();
    const { stdout } = await execWithEnv(
      `${caddyBin} adapt --config /opt/homebrew/etc/Caddyfile 2>/dev/null || ${caddyBin} adapt --config /usr/local/etc/Caddyfile 2>/dev/null || ${caddyBin} adapt --config ~/Caddyfile`,
    );
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

/**
 * Parse Caddy config to extract routes/URLs with proxy targets
 */
export function parseConfigRoutes(config: CaddyConfig | null): CaddyRoute[] {
  if (!config?.apps?.http?.servers) {
    return [];
  }

  const routes: CaddyRoute[] = [];

  for (const server of Object.values(config.apps.http.servers)) {
    const defaultPort = server.listen?.[0]?.split(":")?.[1] || "80";

    if (server.routes) {
      for (const route of server.routes) {
        let proxyTarget: string | undefined;

        // Try to extract reverse_proxy upstream
        if (route.handle) {
          for (const handler of route.handle) {
            if (handler.handler === "reverse_proxy" && handler.upstreams) {
              proxyTarget = handler.upstreams[0]?.dial;
            } else if (handler.routes) {
              // Check nested routes for reverse_proxy
              for (const subroute of handler.routes) {
                if (subroute.handle) {
                  for (const subhandler of subroute.handle) {
                    if (subhandler.handler === "reverse_proxy" && subhandler.upstreams) {
                      proxyTarget = subhandler.upstreams[0]?.dial;
                      break;
                    }
                    // Check even deeper nested routes
                    if (subhandler.routes) {
                      for (const deepRoute of subhandler.routes) {
                        if (deepRoute.handle) {
                          for (const deepHandler of deepRoute.handle) {
                            if (deepHandler.handler === "reverse_proxy" && deepHandler.upstreams) {
                              proxyTarget = deepHandler.upstreams[0]?.dial;
                              break;
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }

        if (route.match) {
          for (const match of route.match) {
            if (match.host) {
              for (const host of match.host) {
                const protocol = defaultPort === "443" ? "https" : "http";
                const portSuffix = defaultPort === "80" || defaultPort === "443" ? "" : `:${defaultPort}`;
                routes.push({
                  host,
                  port: defaultPort,
                  url: `${protocol}://${host}${portSuffix}`,
                  proxyTarget,
                });
              }
            }
          }
        }
      }
    }
  }

  return routes;
}

/**
 * Read Caddyfile directly
 */
export async function getCaddyfile(): Promise<string | null> {
  try {
    const possiblePaths = [
      "/opt/homebrew/etc/Caddyfile",
      "/usr/local/etc/Caddyfile",
      "~/Caddyfile",
      "/etc/caddy/Caddyfile",
    ];

    for (const path of possiblePaths) {
      try {
        const { stdout } = await execWithEnv(`cat ${path}`);
        if (stdout) {
          return stdout;
        }
      } catch {
        continue;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a port is listening/reachable
 */
export async function isPortReachable(target: string): Promise<boolean> {
  try {
    // Extract host and port from target like "127.0.0.1:3046"
    const [host, port] = target.split(":");
    if (!host || !port) return false;

    // Use nc (netcat) to check if port is open
    await execWithEnv(`nc -z -w 1 ${host} ${port}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check reachability for all routes
 */
export async function checkRoutesReachability(routes: CaddyRoute[]): Promise<CaddyRoute[]> {
  const routesWithStatus = await Promise.all(
    routes.map(async (route) => {
      if (route.proxyTarget) {
        const isReachable = await isPortReachable(route.proxyTarget);
        return { ...route, isReachable };
      }
      return { ...route, isReachable: undefined };
    }),
  );
  return routesWithStatus;
}

/**
 * Parse Caddyfile to extract domain names
 */
export function parseCaddyfile(caddyfile: string): string[] {
  const domains: string[] = [];
  const lines = caddyfile.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      continue;
    }

    // Look for domain patterns (lines that look like domains)
    if (trimmed.match(/^[a-zA-Z0-9][a-zA-Z0-9-_.]*\.[a-zA-Z]{2,}(:[0-9]+)?(\s*\{)?$/)) {
      const domain = trimmed.replace(/\s*\{$/, "").trim();
      domains.push(domain);
    }

    // Look for localhost patterns
    if (trimmed.match(/^localhost(:[0-9]+)?(\s*\{)?$/)) {
      const domain = trimmed.replace(/\s*\{$/, "").trim();
      domains.push(domain);
    }

    // Look for IP patterns
    if (trimmed.match(/^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}(:[0-9]+)?(\s*\{)?$/)) {
      const domain = trimmed.replace(/\s*\{$/, "").trim();
      domains.push(domain);
    }
  }

  return domains;
}
