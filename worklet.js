/**
 * JARVIS AudioWorklet Processor
 * Runs in a separate audio thread — zero UI blocking.
 * Downsample from native sample rate → 16kHz PCM Int16 mono.
 */
class JarvisMicProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._targetRate = 16000;
    this._inputRate = options.processorOptions?.inputSampleRate || 44100;
    this._ratio = this._inputRate / this._targetRate;
    this._buffer = [];
    this._bufferThreshold = 1024; // Send every ~64ms at 16kHz
    this._indexRemainder = 0;
  }

  // Linear interpolation downsample with continuous phase alignment
  _downsample(inputData) {
    const output = [];
    let srcIndex = this._indexRemainder;
    while (srcIndex < inputData.length) {
      const srcFloor = Math.floor(srcIndex);
      const srcCeil = Math.min(srcFloor + 1, inputData.length - 1);
      const t = srcIndex - srcFloor;
      output.push(inputData[srcFloor] * (1 - t) + inputData[srcCeil] * t);
      srcIndex += this._ratio;
    }
    this._indexRemainder = srcIndex - inputData.length;
    return new Float32Array(output);
  }

  // Convert Float32 → Int16 with clean amplification
  _floatToInt16(floatData) {
    const gain = 1.5;
    const int16 = new Int16Array(floatData.length);
    for (let i = 0; i < floatData.length; i++) {
      const s = Math.max(-1, Math.min(1, floatData[i] * gain));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // Mono
    const downsampled = this._downsample(channelData);

    // Accumulate in buffer
    for (let i = 0; i < downsampled.length; i++) {
      this._buffer.push(downsampled[i]);
    }

    // Flush when we have enough samples
    if (this._buffer.length >= this._bufferThreshold) {
      const chunk = new Float32Array(this._buffer.splice(0, this._bufferThreshold));
      const int16 = this._floatToInt16(chunk);
      // Transfer the buffer to the main thread
      this.port.postMessage({ int16: int16.buffer }, [int16.buffer]);
    }

    return true; // Keep processor alive
  }
}

registerProcessor('jarvis-mic-processor', JarvisMicProcessor);
