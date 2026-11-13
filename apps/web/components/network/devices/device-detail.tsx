import { CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { LiveDeviceCard } from "@/components/network/devices/live-device-card";
import { getDevicesResult } from "@/lib/homenet-api";

/** The device's live card, or why it cannot be shown. */
export async function DeviceDetail({ mac }: { mac: string }) {
  const { data: result, error } = await load(getDevicesResult);
  if (error !== undefined) {
    return (
      <div className="glass flex rounded-2xl p-4">
        <CardUnavailable message={`${error} The device's history is below.`} />
      </div>
    );
  }

  const device = result.devices.find((item) => item.mac === mac);
  if (!device) {
    return (
      <div className="glass rounded-2xl p-4">
        <p className="font-medium text-foreground">Unknown device</p>
        <p className="text-sm text-muted">Neither the router nor the history knows {mac}.</p>
      </div>
    );
  }
  return <LiveDeviceCard initialDevice={device} fetchedAt={result.fetchedAt} />;
}
