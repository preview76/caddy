import { showHUD, showToast, Toast } from "@raycast/api";
import { startCaddy } from "./utils";

export default async function Command() {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Starting Caddy...",
  });

  const result = await startCaddy();

  if (result.success) {
    toast.style = Toast.Style.Success;
    toast.title = "Success";
    toast.message = result.message;
    await showHUD("✅ Caddy started successfully");
  } else {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to start Caddy";
    toast.message = result.message;
  }
}
