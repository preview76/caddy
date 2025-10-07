import { showHUD, showToast, Toast } from "@raycast/api";
import { restartCaddy } from "./utils";

export default async function Command() {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Restarting Caddy...",
  });

  const result = await restartCaddy();

  if (result.success) {
    toast.style = Toast.Style.Success;
    toast.title = "Success";
    toast.message = result.message;
    await showHUD("✅ Caddy restarted successfully");
  } else {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to restart Caddy";
    toast.message = result.message;
  }
}
