/**
 * Encode raw PCM 16-bit mono chunks into a valid standard WAV Buffer
 */

export function encodeWAV(pcmBuffer, sampleRate = 24000, numChannels = 1) {
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  // RIFF chunk descriptor
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4); // Chunk size
  header.write('WAVE', 8);

  // fmt sub-chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);           // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20);            // AudioFormat (1 for PCM)
  header.writeUInt16LE(numChannels, 22);  // NumChannels
  header.writeUInt32LE(sampleRate, 24);   // SampleRate
  header.writeUInt32LE(byteRate, 28);     // ByteRate
  header.writeUInt16LE(blockAlign, 32);   // BlockAlign
  header.writeUInt16LE(16, 34);           // BitsPerSample (16-bit)

  // data sub-chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}
