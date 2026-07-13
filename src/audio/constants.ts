/** Fixed pulse resolution shared by playback, visual events, MIDI, and WAV. */
export const AUDIO_PPQ = 480 as const;

export const MIDI_DRUM_NOTES = {
  kick: 36,
  snare: 38,
  clap: 39,
  "closed-hat": 42,
  "open-hat": 46,
  rim: 37,
  perc: 50,
} as const;
