class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Factor de dithering TPDF para evitar distorsión de cuantización en señales débiles
    this._dither = 1.0 / 32768.0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length || !input[0].length) return true;

    // Mixdown multi-canal a mono para máxima compatibilidad
    const numChannels = input.length;
    const frameCount = input[0].length;
    const pcm = new Int16Array(frameCount);

    for (let i = 0; i < frameCount; i++) {
      let sample = 0;
      for (let c = 0; c < numChannels; c++) {
        sample += input[c][i];
      }
      sample /= numChannels;

      // Clamping + dithering TPDF para reducir ruido de cuantización en voz baja
      const dither = (Math.random() - Math.random()) * this._dither;
      sample = Math.max(-1, Math.min(1, sample + dither));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }

    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
