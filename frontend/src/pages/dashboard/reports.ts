import { VISION_ENDPOINT, VISION_MODEL } from "../../config";
import type { GroupedAnalyses, WebcamAnalysis } from "./types";

const ANALYSIS_STORAGE_KEY = "astracodex_webcam_analysis";
const SUMMARY_STORAGE_KEY = "astracodex_webcam_summaries";

export const readWebcamAnalyses = (): WebcamAnalysis[] => {
  try {
    const data = localStorage.getItem(ANALYSIS_STORAGE_KEY);
    const parsed = data ? JSON.parse(data) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const readSavedSummaries = (): Record<string, string> => {
  try {
    const saved = localStorage.getItem(SUMMARY_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

export const saveSummaries = (summaries: Record<string, string>) => {
  localStorage.setItem(SUMMARY_STORAGE_KEY, JSON.stringify(summaries));
  return summaries;
};

export const groupWebcamAnalyses = (analyses: WebcamAnalysis[]): GroupedAnalyses => (
  analyses.reduce<GroupedAnalyses>((acc, entry) => {
    const date = new Date(entry.timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    if (!acc[date]) acc[date] = {};
    const title = entry.lessonTitle || "General Lesson";
    if (!acc[date][title]) acc[date][title] = [];
    acc[date][title].push(entry);
    return acc;
  }, {})
);

export const sortReportDates = (groupedAnalyses: GroupedAnalyses): string[] => (
  Object.keys(groupedAnalyses).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
);

export const summarizeWebcamAnalyses = async (
  date: string,
  title: string,
  entries: WebcamAnalysis[],
): Promise<string> => {
  const prompt = `Following are AI mentor observations of a student during a lesson titled "${title}" on ${date}. 
    Please provide a concise, high-level summary (2-3 sentences) for a parent about the student's overall engagement and focus during this session.
    Do not use any markdown formatting like bolding or bullet points, just plain text.
    
    Observations:
    ${entries.map((entry) => `- ${entry.analysis}`).join("\n")}`;

  const response = await fetch(VISION_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VISION_MODEL,
      prompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    return "";
  }

  const result = await response.json() as { response?: string };
  return result.response || "";
};
