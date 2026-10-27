let context: AudioContext | null = null;

export function playCue(kind: "ok" | "no" | "tap", enabled: boolean): void {
  if (!enabled) return;
  const audio = window.AudioContext ?? window.webkitAudioContext;
  if (!audio) return;
  context ??= new audio();
  const now = context.currentTime;
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = "sine";
  osc.frequency.value = kind === "ok" ? 620 : kind === "no" ? 220 : 440;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

export function speakEnglish(text: string): boolean {
  if (!("speechSynthesis" in window)) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.92;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
