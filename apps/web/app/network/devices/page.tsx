import type { Metadata } from "next";
import { Suspense } from "react";

import { CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { DevicesIcon } from "@/components/icons/devices-icon";
import { Page } from "@/components/layout/page";
import { DeviceList } from "@/components/network/devices/device-list";
import { PanelSkeleton } from "@/components/ui/panel";
import { Reveal } from "@/components/ui/reveal";
import { getDevicesResult } from "@/lib/homenet-api";

export const metadata: Metadata = {
  title: "Devices · Network · Home Server",
};

async function Devices() {
  const { data, error } = await load(getDevicesResult);
  if (error !== undefined) {
    return (
      <div className="glass flex rounded-3xl p-5">
        <CardUnavailable message={`${error} The router may not be answering either.`} />
      </div>
    );
  }
  return <DeviceList initialDevices={data.devices} fetchedAt={data.fetchedAt} />;
}

export default function DevicesPage() {
  return (
    <Page section="Network" title="Devices" Icon={DevicesIcon}>
      <Reveal index={1}>
        <Suspense fallback={<PanelSkeleton height={320} />}>
          <Devices />
        </Suspense>
      </Reveal>
    </Page>
  );
}
