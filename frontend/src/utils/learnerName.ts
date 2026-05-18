export const LEARNER_NAME_STORAGE_KEY = 'astracodex_user_name';

export const normalizeLearnerName = (value: string | null | undefined) =>
  value?.trim().replace(/\s+/g, ' ') || '';

export const getStoredLearnerName = () => {
  try {
    return normalizeLearnerName(localStorage.getItem(LEARNER_NAME_STORAGE_KEY));
  } catch {
    return '';
  }
};

export const saveStoredLearnerName = (value: string) => {
  const learnerName = normalizeLearnerName(value);
  if (!learnerName) return '';

  localStorage.setItem(LEARNER_NAME_STORAGE_KEY, learnerName);
  return learnerName;
};
