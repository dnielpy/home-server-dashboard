import Link from "next/link";

import { CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { DevicesIcon } from "@/components/icons/devices-icon";
import { ChartLegend } from "@/components/network/chart-legend";
import { DeviceKindIcon, KIND_LABELS } from "@/components/network/device-kind-icon";
import { Panel, PanelEmpty } from "@/components/ui/panel";
import { RangeFilter } from "@/components/ui/range-filter";
import { getDeviceUsage } from "@/lib/homenet-api";
import { formatBytes } from "@/lib/network/bytes-format";
import { SERIES_COLORS } from "@/lib/network/chart-colors";
import { deviceKind } from "@/lib/network/device-kind";
import { parseTimeRange, TIME_RANGES } from "@/lib/network/time-ranges";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// The heaviest devices shown
const TOP_COUNT = 10;

/** The devices that used the most bandwidth, as bars split into download and upload. */
export async function DeviceUsageStats({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const range = parseTimeRange(params.deviceHours, TIME_RANGES);
  const { data: usage, error } = await load(() => getDeviceUsage(range.hours));

  const filter = (
    <RangeFilter
      label="Top devices time range"
      param="deviceHours"
      ranges={TIME_RANGES}
      selected={range}
      searchParams={params}
      path="/network/stats"
    />
  );

  if (error !== undefined) {
    return (
      <Panel id="device-usage-title" title="Top devices" Icon={DevicesIcon} accent="violet" actions={filter}>
        <CardUnavailable message={error} />
      </Panel>
    );
  }

  const top = usage.slice(0, TOP_COUNT);
  const max = Math.max(1, ...top.map((device) => device.down_bytes + device.up_bytes));
  const percent = (bytes: number) => `${(bytes / max) * 100}%`;
  const count = `${usage.length} ${usage.length === 1 ? "device" : "devices"} used data`;

  return (
    <Panel
      id="device-usage-title"
      title="Top devices"
      subtitle={`${range.description} · ${count}${usage.length > TOP_COUNT ? ` · top ${TOP_COUNT}` : ""}`}
      Icon={DevicesIcon}
      accent="violet"
      actions={filter}
    >
      {top.length === 0 ? (
        <PanelEmpty height={128}>No device used data in this period.</PanelEmpty>
      ) : (
        <div className="flex flex-col gap-3">
          <ChartLegend
            items={[
              { label: "Download", color: SERIES_COLORS.download },
              { label: "Upload", color: SERIES_COLORS.upload },
            ]}
          />
          <ol aria-label="Devices by bandwidth used" className="flex flex-col text-xs">
            {top.map((device) => {
              const kind = deviceKind(device.name);
              const total = device.down_bytes + device.up_bytes;
              return (
                <li key={device.mac} className="flex h-10 items-center">
                  {/* On phones only the icon shows, so the bars get the width; the name stays for screen readers */}
                  <Link
                    href={`/network/devices/${encodeURIComponent(device.mac)}`}
                    title={device.name || device.mac}
                    className="flex w-8 shrink-0 items-center gap-2 pr-3 text-sm text-muted transition-colors hover:text-foreground sm:w-48"
                  >
                    <DeviceKindIcon kind={kind} className="h-4 w-4 shrink-0" />
                    <span className="sr-only">{KIND_LABELS[kind]}:</span>
                    <span className={`sr-only truncate sm:not-sr-only ${device.name ? "" : "font-mono text-xs"}`}>
                      {device.name || device.mac}
                    </span>
                  </Link>
                  <div
                    tabIndex={0}
                    aria-label={`${formatBytes(total)}: ${formatBytes(device.down_bytes)} down, ${formatBytes(device.up_bytes)} up`}
                    className="group relative mr-16 flex min-w-0 flex-1 items-center outline-none"
                  >
                    <span
                      className="flex h-4.5 min-w-1 overflow-hidden rounded-full shadow-[0_0_18px_-6px_rgb(14_165_233/0.8)] transition-opacity group-hover:opacity-80"
                      style={{ width: percent(total) }}
                    >
                      <span
                        className="h-full bg-linear-to-r from-sky-600 to-sky-400"
                        style={{ width: `${(device.down_bytes / total) * 100}%` }}
                      />
                      <span className="h-full flex-1 bg-linear-to-r from-violet-500 to-violet-400" />
                    </span>
                    <span
                      className="absolute pl-2 font-medium whitespace-nowrap text-foreground tabular-nums"
                      style={{ left: percent(total) }}
                    >
                      {formatBytes(total)}
                    </span>
                    <span className="glass pointer-events-none invisible absolute bottom-full left-0 z-10 mb-1 rounded-xl px-3 py-2 whitespace-nowrap shadow-xl group-hover:visible group-focus-visible:visible">
                      <span className="block text-sm font-semibold text-foreground tabular-nums">{formatBytes(total)}</span>
                      <span className="mt-0.5 block text-muted tabular-nums">
                        ↓ {formatBytes(device.down_bytes)} · ↑ {formatBytes(device.up_bytes)}
                      </span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </Panel>
  );
}
