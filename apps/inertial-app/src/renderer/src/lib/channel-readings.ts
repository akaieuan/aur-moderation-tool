/**
 * Plain-language readings for signal channels.
 *
 * The dashboard renders `harassment.targeted · 0.94 · span 29..52`. That is
 * precise, and it does not tell a reviewer what the system *concluded* — it
 * makes them decode a schema before they can decide. The numbers stay, because
 * they are what policy acts on; this adds the sentence beside them.
 *
 * The case that most needs it is the channel that reported nothing. As a blank
 * cell, "never reached a conclusion" and "looked and found it clean" are the
 * same absence — and they are not the same fact. `absent` is the reading that
 * exists to keep those apart.
 *
 * This lives in the renderer rather than `@inertial/core` on purpose: it is
 * presentation, it changes no agent contract, and the renderer deliberately
 * avoids importing core so server-side dependencies stay out of the bundle
 * (see the note at the top of `lib/api.ts`).
 */

export interface ChannelReading {
  /** Human name. Falls back to the raw channel id when unknown. */
  label: string;
  /** What a score at or above the fire threshold means, in one sentence. */
  fired: string;
  /** What a low score means. */
  clear: string;
  /** What silence means — never "this is fine". */
  absent: string;
}

const READINGS: Record<string, ChannelReading> = {
  toxic: {
    label: "Toxicity",
    fired: "Reads as hostile or demeaning toward someone in the thread.",
    clear: "No hostile language detected.",
    absent: "Toxicity was never assessed on this event.",
  },
  severe_toxic: {
    label: "Severe toxicity",
    fired: "Hostility severe enough that most policies escalate it on sight.",
    clear: "Nothing at the severe end of the scale.",
    absent: "Severe toxicity was never assessed on this event.",
  },
  obscene: {
    label: "Obscenity",
    fired: "Contains explicit or obscene language.",
    clear: "No obscene language detected.",
    absent: "Obscenity was never assessed on this event.",
  },
  threat: {
    label: "Threat",
    fired: "Reads as a threat of harm against a person or group.",
    clear: "No threatening language detected.",
    absent: "Threat was never assessed on this event.",
  },
  insult: {
    label: "Insult",
    fired: "Directed insult at a specific person.",
    clear: "No directed insult detected.",
    absent: "Insult was never assessed on this event.",
  },
  identity_hate: {
    label: "Identity hate",
    fired: "Attacks someone over a protected characteristic.",
    clear: "No identity-based attack detected.",
    absent: "Identity hate was never assessed on this event.",
  },
  "spam-link-presence": {
    label: "Spam link",
    fired: "Carries links matching known spam patterns.",
    clear: "No spam-pattern links found.",
    absent: "Links were never checked on this event.",
  },
  image_nsfw: {
    label: "Image NSFW",
    fired: "Imagery reads as sexual, graphic, or otherwise not safe for work.",
    clear: "Imagery reads as safe for work.",
    absent:
      "No image classifier ran. Attached media has not been looked at at all.",
  },
  "context.author-prior-actions": {
    label: "Author history",
    fired: "This author has prior moderation actions against their content.",
    clear: "No prior moderation actions on record for this author.",
    absent: "Author history was not retrieved for this event.",
  },
  "context.similar-events": {
    label: "Similar events",
    fired: "Closely resembles past events on this instance — possible pattern.",
    clear: "Nothing closely similar in recent history.",
    absent:
      "Similarity was not computed — no embedding exists for this event.",
  },
};

/** Threshold above which a channel reads as "fired" for display purposes.
 *  Presentation only — policy thresholds live in the YAML, per instance. */
const FIRE_AT = 0.5;

export function channelLabel(channel: string): string {
  return READINGS[channel]?.label ?? channel;
}

/**
 * The sentence to show for a channel that reported. Returns null for channels
 * with no entry, so callers render the id alone rather than a made-up gloss.
 */
export function readingFor(channel: string, probability: number): string | null {
  const r = READINGS[channel];
  if (!r) return null;
  return probability >= FIRE_AT ? r.fired : r.clear;
}

/** The sentence to show for a channel that emitted nothing. */
export function absentReadingFor(channel: string): string {
  return (
    READINGS[channel]?.absent ??
    `${channel} was never assessed on this event.`
  );
}

/**
 * Channels a reviewer should be told about even when nothing reported them.
 *
 * Silence on these is a coverage gap worth surfacing, not a clean bill — an
 * event whose images were never classified is not an event whose images are
 * fine.
 */
export const NOTABLE_CHANNELS: readonly string[] = [
  "toxic",
  "threat",
  "identity_hate",
  "image_nsfw",
];

/** Notable channels absent from a signal's emitted set. */
export function silentChannels(emitted: readonly string[]): string[] {
  const seen = new Set(emitted);
  return NOTABLE_CHANNELS.filter((c) => !seen.has(c));
}
