import { VISION_ENDPOINT, VISION_MODEL } from "../../config";

type WebcamAnalysisOptions = {
  video: HTMLVideoElement;
  lessonTitle: string;
  slideIndex: number;
};

const ANALYSIS_STORAGE_KEY = "astracodex_webcam_analysis";
const SUMMARY_STORAGE_KEY = "astracodex_webcam_summaries";

function appendWebcamAnalysis(analysis: string, lessonTitle: string, slideIndex: number) {
  const existing = localStorage.getItem(ANALYSIS_STORAGE_KEY);
  let analysisHistory: unknown[] = [];

  try {
    analysisHistory = existing ? JSON.parse(existing) : [];
    if (!Array.isArray(analysisHistory)) analysisHistory = [existing];
  } catch {
    analysisHistory = [existing].filter(Boolean);
  }

  analysisHistory.push({
    timestamp: new Date().toISOString(),
    analysis,
    slideIndex,
    lessonTitle,
  });

  localStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(analysisHistory));
}

function clearStaleSummary(lessonTitle: string) {
  try {
    const today = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const summaryKey = `${today}-${lessonTitle}`;
    const savedSummaries = localStorage.getItem(SUMMARY_STORAGE_KEY);
    if (!savedSummaries) return;

    const summaries = JSON.parse(savedSummaries);
    if (summaries[summaryKey]) {
      delete summaries[summaryKey];
      localStorage.setItem(SUMMARY_STORAGE_KEY, JSON.stringify(summaries));
    }
  } catch (error) {
    console.error("Error clearing stale summary:", error);
  }
}

export async function captureAndAnalyzeWebcamSnapshot({
  video,
  lessonTitle,
  slideIndex,
}: WebcamAnalysisOptions): Promise<boolean> {
  if (video.videoWidth === 0) {
    return false;
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = canvas.toDataURL("image/jpeg", 0.8);
    const base64Data = imageData.split(",")[1];

    console.log("Captured webcam image, sending...");

    const response = await fetch(VISION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        prompt:
          "This is a frame from a student's webcam during an online lesson. Look at the student's face, posture, and expression. In 1-2 sentences, tell a parent: is this student focused, confused, or disengaged? What do you notice?",
        images: [base64Data],
        stream: false,
      }),
    });

    if (!response.ok) {
      console.warn('Failed to send image. Check if vision model is running with VISION_ORIGINS="*"');
      return true;
    }

    const result = await response.json();
    console.log("Vision model analysis:", result.response);

    appendWebcamAnalysis(result.response, lessonTitle, slideIndex);
    clearStaleSummary(lessonTitle);
  } catch (err) {
    console.error("Error analyzing webcam image:", err);
  }

  return true;
}
