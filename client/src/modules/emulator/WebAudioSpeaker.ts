const workletCode = `
class NESAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = 8192;
    this.bufferL = new Float32Array(this.capacity);
    this.bufferR = new Float32Array(this.capacity);
    this.readPos = 0;
    this.writePos = 0;
    this.count = 0;

    this.port.onmessage = (event) => {
      if (event.data.type !== "samples") return;
      const left = event.data.left;
      const right = event.data.right;
      const len = left.length;

      if (this.count + len > this.capacity) {
        const drop = this.count + len - this.capacity;
        this.readPos = (this.readPos + drop) % this.capacity;
        this.count -= drop;
      }

      for (let i = 0; i < len; i++) {
        this.bufferL[this.writePos] = left[i];
        this.bufferR[this.writePos] = right[i];
        this.writePos = (this.writePos + 1) % this.capacity;
      }

      this.count += len;
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const outL = output[0];
    const outR = output[1];
    const size = outL.length;

    for (let i = 0; i < size; i++) {
      if (this.count > 0) {
        outL[i] = this.bufferL[this.readPos];
        outR[i] = this.bufferR[this.readPos];
        this.readPos = (this.readPos + 1) % this.capacity;
        this.count -= 1;
      } else {
        outL[i] = 0;
        outR[i] = 0;
      }
    }

    return true;
  }
}

registerProcessor("nes-audio-processor", NESAudioProcessor);
`;

const BATCH_SIZE = 128;

export class WebAudioSpeaker {
  private audioContext: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private batchLeft = new Float32Array(BATCH_SIZE);
  private batchRight = new Float32Array(BATCH_SIZE);
  private batchPosition = 0;
  private resumeHandler: (() => void) | null = null;

  getSampleRate() {
    return this.audioContext?.sampleRate ?? 44100;
  }

  async start() {
    if (this.audioContext || typeof window.AudioContext === 'undefined') {
      return;
    }

    this.audioContext = new window.AudioContext();
    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);
    await this.audioContext.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);

    this.node = new AudioWorkletNode(this.audioContext, 'nes-audio-processor', {
      outputChannelCount: [2],
    });
    this.node.connect(this.audioContext.destination);

    if (this.audioContext.state === 'suspended') {
      this.resumeHandler = () => {
        void this.audioContext?.resume();
        this.removeResumeListeners();
      };

      document.addEventListener('keydown', this.resumeHandler);
      document.addEventListener('mousedown', this.resumeHandler);
    }
  }

  writeSample(left: number, right: number) {
    if (!this.node) {
      return;
    }

    this.batchLeft[this.batchPosition] = left;
    this.batchRight[this.batchPosition] = right;
    this.batchPosition += 1;

    if (this.batchPosition >= BATCH_SIZE) {
      this.flush();
    }
  }

  flush() {
    if (!this.node || this.batchPosition === 0) {
      return;
    }

    this.node.port.postMessage({
      type: 'samples',
      left: this.batchLeft.slice(0, this.batchPosition),
      right: this.batchRight.slice(0, this.batchPosition),
    });

    this.batchPosition = 0;
  }

  stop() {
    this.removeResumeListeners();
    this.node?.disconnect();
    this.node = null;
    void this.audioContext?.close();
    this.audioContext = null;
    this.batchPosition = 0;
  }

  private removeResumeListeners() {
    if (!this.resumeHandler) {
      return;
    }

    document.removeEventListener('keydown', this.resumeHandler);
    document.removeEventListener('mousedown', this.resumeHandler);
    this.resumeHandler = null;
  }
}
