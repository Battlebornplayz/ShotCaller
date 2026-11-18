/**
 * The hidden Fortnite audio window: listens to what the PC is playing (Windows loopback, not the microphone),
 * turns it into 16 kHz mono and passes it to the main process in small pieces. Started by the main process.
 */

const RATE = 16000;

async function start(): Promise<void> {
  try {
    // The picture track is only there because the sound can't be asked for alone; it's dropped at once.
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: 64, height: 64, frameRate: 1 }, audio: true });
    stream.getVideoTracks().forEach((t) => t.stop());
    const tracks = stream.getAudioTracks();
    if (!tracks.length) throw new Error('Windows gave no sound to listen to.');
    const ctx = new AudioContext({ sampleRate: RATE });
    const source = ctx.createMediaStreamSource(new MediaStream(tracks));
    const node = ctx.createScriptProcessor(4096, 2, 1);
    node.onaudioprocess = (e) => {
      const l = e.inputBuffer.getChannelData(0);
      const r = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : l;
      const pcm = new Int16Array(l.length);
      for (let i = 0; i < l.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(((l[i] + r[i]) / 2) * 32767)));
      window.shotcaller.sendFortniteAudio(pcm.buffer);
    };
    source.connect(node);
    // The node only runs while it leads somewhere; a silent gain keeps it from being played back.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    node.connect(mute);
    mute.connect(ctx.destination);
    if (ctx.state !== 'running') await ctx.resume();
  } catch (err) {
    window.shotcaller.reportFortniteAudioError(err instanceof Error ? err.message : String(err));
  }
}

(window as unknown as { __fnAudioStart: () => void }).__fnAudioStart = () => void start();

export {};
