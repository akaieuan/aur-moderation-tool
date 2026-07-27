import { CircleDashed } from "lucide-react";
import {
  absentReadingFor,
  channelLabel,
  silentChannels,
} from "../lib/channel-readings.js";

interface SilentChannelsProps {
  /** Channel ids the signal actually carried. */
  emitted: readonly string[];
}

/**
 * Notable channels that reported nothing.
 *
 * A reviewer reading a list of scores naturally treats what isn't listed as
 * fine. It isn't — an event whose images were never classified is not an event
 * whose images are clean, and that difference is invisible when the absence is
 * just a row that doesn't exist.
 *
 * Rendered deliberately quiet: this is a coverage note, not a finding. It
 * should inform the decision without competing with the channels that did fire.
 */
export function SilentChannels({ emitted }: SilentChannelsProps) {
  const silent = silentChannels(emitted);
  if (silent.length === 0) return null;

  return (
    <div className="mt-3 rounded-md border border-dashed border-border px-3 py-2">
      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        <CircleDashed className="h-3 w-3" strokeWidth={1.5} />
        Never concluded
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {silent.map((channel) => (
          <li key={channel} className="text-[11px] leading-snug">
            <span className="text-foreground">{channelLabel(channel)}</span>
            <span className="text-muted-foreground">
              {" — "}
              {absentReadingFor(channel)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
