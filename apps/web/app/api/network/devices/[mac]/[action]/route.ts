import { SourceUnavailableError } from "@/lib/api";
import { ApiRejectedError, DEVICE_ACTIONS, type DeviceAction, postDeviceAction } from "@/lib/homenet-api";

function isDeviceAction(action: string): action is DeviceAction {
  return (DEVICE_ACTIONS as readonly string[]).includes(action);
}

// Block, limit and rename go through here for the same reason as the device list
export async function POST(request: Request, ctx: RouteContext<"/api/network/devices/[mac]/[action]">) {
  const { mac, action } = await ctx.params;
  if (!isDeviceAction(action)) {
    return Response.json({ detail: `Unknown action ${action}` }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  try {
    return Response.json(await postDeviceAction(mac, action, body));
  } catch (error) {
    if (error instanceof ApiRejectedError) {
      return Response.json({ detail: error.detail }, { status: error.status });
    }
    if (error instanceof SourceUnavailableError) {
      return Response.json({ detail: error.message }, { status: 503 });
    }
    throw error;
  }
}
