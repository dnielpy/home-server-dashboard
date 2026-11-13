import { CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { GlobeIcon } from "@/components/icons/globe-icon";
import { Panel } from "@/components/ui/panel";
import { ToneTile } from "@/components/ui/tone-tile";
import { getConnectionStatus } from "@/lib/homenet-api";
import { hopLabel } from "@/lib/network/hops";
import { formatElapsed } from "@/lib/network/outage-format";

const HOUR_MS = 3_600_000;

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function hoursValue(hours: number): string {
  return hours > 0 ? formatElapsed(hours * HOUR_MS) : "None";
}

function share(part: number, whole: number): string {
  return `${whole > 0 ? Math.round((part / whole) * 100) : 0}% of the time`;
}

/** A moment shown as its time, with the day and any notes under it. */
function moment(label: string, value: string | null, ...notes: (string | false)[]) {
  if (!value) return undefined;
  const date = new Date(value);
  return {
    label,
    value: timeFormat.format(date),
    detail: [dayFormat.format(date), ...notes.filter(Boolean)].join(" · "),
  };
}

/** Hours online and offline in the last 24 hours, with when the connection last went out and came back. */
export async function ConnectionStatusCard() {
  const { data, error } = await load(getConnectionStatus);
  const status = data?.status;

  if (error !== undefined || !status || status.online === null || status.current_since === null) {
    return (
      <Panel
        id="connection-status-title"
        title="Connection status"
        subtitle={error === undefined ? "No checks yet" : undefined}
        Icon={GlobeIcon}
        accent="sky"
      >
        {error !== undefined ? (
          <CardUnavailable message={error} />
        ) : (
          <p className="text-sm text-muted">The status will appear once the API stores a check.</p>
        )}
      </Panel>
    );
  }

  const recorded = status.online_hours + status.offline_hours;
  const wentOut = status.online
    ? moment(
        "Went out",
        status.last_outage?.start ?? null,
        status.last_outage?.break_at ? `cut at ${hopLabel(status.last_outage.break_at)}` : false,
      )
    : moment("Went out", status.current_since, `cut at ${hopLabel(status.break_at)}`, "still out");
  const cameBack = status.online
    ? moment("Came back", status.current_since)
    : moment("Came back", status.last_online_period?.start ?? null);

  return (
    <Panel
      id="connection-status-title"
      title="Connection status"
      subtitle={`${status.online ? "Internet is answering" : `Cut at ${hopLabel(status.break_at)}`} · last 24 hours`}
      Icon={GlobeIcon}
      accent={status.online ? "emerald" : "rose"}
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <ToneTile
          tone="green"
          label="Hours online"
          value={hoursValue(status.online_hours)}
          detail={share(status.online_hours, recorded)}
          aside={cameBack}
          live={status.online}
        />
        <ToneTile
          tone="red"
          label="Hours offline"
          value={hoursValue(status.offline_hours)}
          detail={share(status.offline_hours, recorded)}
          aside={wentOut}
          live={!status.online}
        />
      </div>
    </Panel>
  );
}
