/** オリジナルの32拍アンビエント曲。MIDIノート、休符は0。84 BPM。 */
export const MUSIC_BPM = 84;
export const MUSIC_CHORDS = [
  [50, 57, 62, 65], // Dm(add9)
  [46, 53, 58, 62], // Bbmaj7
  [41, 48, 57, 60], // Fmaj7
  [48, 55, 60, 64], // C
] as const;
export const MUSIC_MELODY = [
  74, 0, 77, 76, 74, 0, 69, 72,
  74, 0, 70, 69, 65, 0, 69, 0,
  69, 0, 72, 77, 76, 0, 72, 69,
  67, 0, 72, 76, 74, 0, 0, 0,
] as const;
export const midiFrequency = (note: number) => 440 * Math.pow(2, (note - 69) / 12);
