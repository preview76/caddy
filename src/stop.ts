import { showHUD, showToast, Toast } from "@raycast/api";
import { stopCaddy } from "./utils";

export default async function Command() {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Stopping Caddy...",
  });

  const result = await stopCaddy();

  if (result.success) {
    toast.style = Toast.Style.Success;
    toast.title = "Success";
    toast.message = result.message;
    await showHUD("✅ Caddy stopped successfully");
  } else {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to stop Caddy";
    toast.message = result.message;
  }
}
