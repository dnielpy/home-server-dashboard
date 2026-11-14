type Tone = "red" | "green";

const TONES: Record<Tone, { tile: string; dot: string; live: string }> = {
  red: {
    tile: "accent-rose border-red-500/25!",
    dot: "bg-red-500 shadow-[0_0_10px_rgb(239_68_68)]",
    live: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  green: {
    tile: "accent-emerald border-emerald-500/25!",
    dot: "bg-emerald-500 shadow-[0_0_10px_rgb(16_185_129)]",
    live: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
};

export type TileValue = {
  label: string;
  value: string;
  detail?: string;
};

type ToneTileProps = TileValue & {
  tone: Tone;
  /** A second value shown in the right half of the tile. */
  aside?: TileValue;
  /** The state it shows is the current one. */
  live?: boolean;
};

function TileContent({ label, value, detail, dot }: TileValue & { dot?: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-sm text-muted">
        {dot && <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />}
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums xl:text-3xl">{value}</p>
      {detail && <p className="mt-0.5 text-sm text-muted tabular-nums">{detail}</p>}
    </div>
  );
}

/** A value in red or green, e.g. hours in a blackout; `live` marks the state that is happening now. */
export function ToneTile({ tone, label, value, detail, aside, live }: ToneTileProps) {
  const style = TONES[tone];

  return (
    <div
      className={`glass glass-glow ${style.tile} relative rounded-2xl p-4 ${aside ? "grid grid-cols-2 gap-4" : ""} ${live && aside ? "pt-10 sm:pt-4" : ""}`}
    >
      {live && (
        <span
          className={`absolute top-3.5 right-3.5 inline-flex items-center gap-1.5 rounded-full px-2 py-px text-[11px] font-medium ${style.live}`}
        >
          <span aria-hidden className="pulse-dot h-1.5 w-1.5" />
          Now
        </span>
      )}
      <TileContent label={label} value={value} detail={detail} dot={style.dot} />
      {aside && (
        <div className="border-l border-surface-border pl-4">
          <TileContent {...aside} />
        </div>
      )}
    </div>
  );
}
