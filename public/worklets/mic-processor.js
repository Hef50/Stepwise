/**
 * AudioWorkletProcessor that captures raw microphone samples and forwards
 * them to the main thread as Int16 PCM buffers (suitable for Gemini Live API).
 *
 * The processor deliberately avoids resampling — the actual sample rate of
 * the AudioContext is included in the MIME type sent to the Live API, which
 * handles resampling on its end.
 */
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Buffer to accumulate samples before posting (reduces postMessage overhead)
    this._buffer = [];
    this._bufferSize = 4096; // ~85ms at 48kHz
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channel = input[0]; // mono
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this._buffer.push(channel[i]);
    }

    if (this._buffer.length >= this._bufferSize) {
      // Convert Float32 → Int16 PCM
      const pcm16 = new Int16Array(this._buffer.length);
      for (let i = 0; i < this._buffer.length; i++) {
        const s = Math.max(-1, Math.min(1, this._buffer[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      // Transfer ownership to avoid a copy
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
      this._buffer = [];
    }

    return true; // keep the processor alive
  }
}

registerProcessor("mic-processor", MicProcessor);
