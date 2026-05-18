const contentImages: Record<string, string> = import.meta.glob('../../data/content/**/*.{png,jpg,jpeg,gif,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const contentHtmls: Record<string, string> = import.meta.glob('../../data/content/**/*.html', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const resolveLessonAssetUrl = (
  source: string,
  courseId: string | undefined,
  lessonId: string | undefined,
  assets: Record<string, string>,
) => {
  if (!source) return '';
  if (source.startsWith('http') || source.startsWith('/')) return source;
  if (!courseId || !lessonId) return `/assets/${source}`;

  const expectedPath = `../../data/content/${courseId}/lesson-${lessonId}/${source}`;
  return assets[expectedPath] || `/assets/${source}`;
};

export const getLessonImageUrl = (
  source: string,
  courseId: string | undefined,
  lessonId: string | undefined,
) => resolveLessonAssetUrl(source, courseId, lessonId, contentImages);

export const getLessonHtmlUrl = (
  source: string,
  courseId: string | undefined,
  lessonId: string | undefined,
) => resolveLessonAssetUrl(source, courseId, lessonId, contentHtmls);
