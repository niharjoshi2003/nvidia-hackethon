/**
 * The interviewer's voice: the browser's built-in text-to-speech, nothing else.
 *
 * Reading the question aloud is what makes a short turn feel like an interview
 * instead of a form. The microphone only starts after the voice has finished,
 * otherwise the recogniser would transcribe the question as the answer.
 *
 * Browsers are unreliable here (some never fire `onend`, some load voices late),
 * so every path ends in exactly one call to `onDone`, with a timeout as the
 * backstop. Text is read as given: it is the same text shown on screen.
 */

export const VOICE_KEY = "sixty.voice";

export const isSpeechSynthesisSupported = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

export function loadVoicePreference(): boolean {
  try {
    return localStorage.getItem(VOICE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveVoicePreference(on: boolean): void {
  try {
    localStorage.setItem(VOICE_KEY, on ? "on" : "off");
  } catch {
    // Private mode: the preference just does not persist.
  }
}

const PREFERRED = /natural|neural|google|aria|jenny|samantha|daniel/i;

/** A clear English voice if one is installed, otherwise the browser default. */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
  return voices.find((v) => PREFERRED.test(v.name)) ?? voices[0] ?? null;
}

export interface Speaking {
  /** Stop talking. `onDone` still fires once, so the caller's flow continues. */
  cancel(): void;
}

/** Read `text` aloud, then call `onDone` exactly once. */
export function speak(text: string, onDone: () => void): Speaking {
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    clearTimeout(backstop);
    onDone();
  };

  // A spoken sentence runs about 2.5 words a second. Allow double that, plus a
  // margin, before assuming the browser dropped its end event.
  const words = text.split(/\s+/).filter(Boolean).length;
  const backstop = setTimeout(done, Math.max(4000, (words / 2.5) * 2000 + 3000));

  if (!isSpeechSynthesisSupported()) {
    setTimeout(done, 0);
    return { cancel: done };
  }

  const synth = window.speechSynthesis;
  // Cancelling when nothing is playing makes Chrome drop the next utterance.
  if (synth.speaking || synth.pending) synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-US";
  utterance.rate = 1;
  utterance.onend = done;
  utterance.onerror = done;
  synth.speak(utterance);

  return {
    cancel: () => {
      synth.cancel();
      done();
    },
  };
}

/** Stop any speech immediately, for when the screen is left. */
export function silence(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}
