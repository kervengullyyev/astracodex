// Same values as Parlor. Parlor listens at 0.5, then raises the threshold
// to 0.92 while the assistant is speaking to reduce echo false triggers.
export const PARLOR_LISTENING_POSITIVE_SPEECH_THRESHOLD = 0.5;
export const PARLOR_SPEAKING_POSITIVE_SPEECH_THRESHOLD = 0.92;
export const PARLOR_NEGATIVE_SPEECH_THRESHOLD = 0.25;
export const PARLOR_REDEMPTION_MS = 600;
export const PARLOR_MIN_SPEECH_MS = 300;
export const PARLOR_PRE_SPEECH_PAD_MS = 300;
export const BARGE_IN_START_DELAY_MS = 1000;
export const BARGE_IN_GRACE_MS = 1000;
