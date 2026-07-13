export interface PcmAudioData {
  sampleRate: number;
  channels: readonly Float32Array[];
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function validatePcm(data: PcmAudioData): number {
  if (!Number.isSafeInteger(data.sampleRate) || data.sampleRate <= 0) {
    throw new Error("WAV sample rate must be a positive integer.");
  }
  if (data.channels.length < 1 || data.channels.length > 2) {
    throw new Error("The WAV encoder supports one or two channels.");
  }
  const frameCount = data.channels[0].length;
  if (data.channels.some((channel) => channel.length !== frameCount)) {
    throw new Error("Every WAV channel must have the same frame count.");
  }
  return frameCount;
}

/** Encode mono or stereo Float32 PCM as a standards-compliant 16-bit WAV. */
export function encodePcm16Wav(data: PcmAudioData): Uint8Array {
  const frameCount = validatePcm(data);
  const channelCount = data.channels.length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const output = new Uint8Array(44 + dataSize);
  const view = new DataView(output.buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, data.sampleRate, true);
  view.setUint32(28, data.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let byteOffset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (const channel of data.channels) {
      const sample = Math.max(-1, Math.min(1, channel[frame] ?? 0));
      const pcm =
        sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
      view.setInt16(byteOffset, pcm, true);
      byteOffset += bytesPerSample;
    }
  }

  return output;
}
