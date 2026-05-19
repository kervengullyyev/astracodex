export interface Lesson {
  id: number;
  title: string;
  description: string;
  status: string;
  progress?: number;
}

export interface Course {
  id: string;
  name: string;
  icon: string;
  heroImage: string;
  bgColor: string;
  btnColor: string;
  arrowColor: string;
  themeColor: string;
  currentTopic: string;
  progress: number;
  lessonsCompleted: number;
  totalLessons: number;
  lessons: Lesson[];
}

export type ThemeStyles = {
  bg: string;
  text: string;
  fill: string;
  track: string;
  hover: string;
  shadow: string;
  circleBg: string;
  borderHover: string;
};

export type WebcamAnalysis = {
  timestamp: string;
  lessonTitle?: string;
  analysis?: string;
};

export type GroupedAnalyses = Record<string, Record<string, WebcamAnalysis[]>>;
