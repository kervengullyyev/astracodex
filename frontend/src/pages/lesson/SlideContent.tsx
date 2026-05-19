import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { FileText, Image as ImageIcon, MonitorPlay, MousePointer2, Play } from "lucide-react";
import { getLessonHtmlUrl, getLessonImageUrl } from "./assets";
import { attachInteractiveBridge } from "./iframeBridge";
import type { HighlightState, IframeKeyHandlers } from "./types";

type SlideContentProps = {
  slide: any;
  isActive?: boolean;
  highlight: HighlightState;
  imageSize: { width: number; height: number } | null;
  onImageSizeChange: (size: { width: number; height: number }) => void;
  courseId?: string;
  lessonId?: string;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  iframeKeyHandlersRef: RefObject<IframeKeyHandlers | null>;
};

export function SlideContent({
  slide,
  isActive = true,
  highlight,
  imageSize,
  onImageSizeChange,
  courseId,
  lessonId,
  iframeRef,
  iframeKeyHandlersRef,
}: SlideContentProps) {
  const imageViewportRef = useRef<HTMLDivElement | null>(null);
  const [imageViewportSize, setImageViewportSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (slide?.type !== "image") return;

    const viewport = imageViewportRef.current;
    if (!viewport) return;

    let frame = 0;
    const updateViewportSize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setImageViewportSize({
          width: viewport.clientWidth,
          height: viewport.clientHeight,
        });
      });
    };

    updateViewportSize();

    const resizeObserver = new ResizeObserver(updateViewportSize);
    resizeObserver.observe(viewport);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [slide?.imageSource, slide?.type]);

  const displayedImageSize = useMemo(() => {
    if (!imageSize || imageViewportSize.width <= 0 || imageViewportSize.height <= 0) {
      return null;
    }

    const scale = Math.min(
      imageViewportSize.width / imageSize.width,
      imageViewportSize.height / imageSize.height,
    );

    return {
      width: imageSize.width * scale,
      height: imageSize.height * scale,
    };
  }, [imageSize, imageViewportSize.height, imageViewportSize.width]);

  if (!slide) return null;

  return (
    <>
      {slide.type === "text" && (
        <div className="flex flex-col items-center justify-center h-full px-36">
          <div className="flex items-center gap-3 mb-6 text-indigo-600">
            <FileText size={28} />
            <h3 className="text-3xl font-bold uppercase tracking-wider">{slide.title || "Concept"}</h3>
          </div>
          {/* <p className="text-2xl sm:text-3xl leading-relaxed text-slate-800 font-medium text-center">
            {slide.text}
          </p> */}
        </div>
      )}

      {slide.type === "image" && (
        <div className="flex flex-col items-center justify-center text-center w-full h-full">
          {slide.imageSource ? (
            <div ref={imageViewportRef} className="h-full min-h-0 w-full flex items-center justify-center overflow-hidden">
              <div
                className="relative flex max-h-full max-w-full items-center justify-center"
                style={
                  displayedImageSize
                    ? { width: displayedImageSize.width, height: displayedImageSize.height }
                    : { width: "100%", height: "100%" }
                }
              >
                {isActive && highlight && imageSize && (
                  <div
                    className="absolute z-50 transition-all duration-500 ease-out pointer-events-none"
                    style={{
                      left: `${(highlight.x / imageSize.width) * 100}%`,
                      top: `${(highlight.y / imageSize.height) * 100}%`,
                    }}
                  >
                    <MousePointer2
                      className="text-blue-600 fill-blue-600 drop-shadow-lg -translate-x-[4px] -translate-y-[4px]"
                      size={48}
                    />
                  </div>
                )}
                <img
                  src={getLessonImageUrl(slide.imageSource, courseId, lessonId)}
                  alt={slide.title || "Visual Example"}
                  className="h-full w-full object-contain rounded-xl"
                  onLoad={(e) => {
                    const img = e.target as HTMLImageElement;
                    if (isActive) {
                      onImageSizeChange({ width: img.naturalWidth, height: img.naturalHeight });
                    }
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mb-6">
              <ImageIcon size={40} />
            </div>
          )}
        </div>
      )}

      {slide.type === "interactive" && (
        <div className="flex flex-col items-center text-center w-full h-full relative">
          {slide.htmlSource ? (
            <div className="relative w-full h-full">
              <iframe
                ref={isActive ? iframeRef : undefined}
                src={getLessonHtmlUrl(slide.htmlSource, courseId, lessonId)}
                className="w-full h-full rounded-2xl"
                title={slide.title || "Interactive Activity"}
                onLoad={
                  isActive
                    ? (e) => {
                        try {
                          const iframeWin = (e.target as HTMLIFrameElement).contentWindow;
                          if (iframeWin) {
                            if (iframeKeyHandlersRef.current) {
                              iframeWin.addEventListener("keydown", iframeKeyHandlersRef.current.down);
                              iframeWin.addEventListener("keyup", iframeKeyHandlersRef.current.up);
                            }
                            attachInteractiveBridge(iframeWin);
                          }
                        } catch (err) {
                          console.warn("Could not attach listeners to iframe (cross-origin?)", err);
                        }
                      }
                    : undefined
                }
              />
              {isActive && highlight && (
                <div
                  className="absolute z-[9999] transition-all duration-500 ease-out pointer-events-none"
                  style={{
                    left: highlight.isDynamic ? `${highlight.x}px` : `${(highlight.x / 1024) * 100}%`,
                    top: highlight.isDynamic ? `${highlight.y}px` : `${(highlight.y / 1024) * 100}%`,
                  }}
                >
                  <MousePointer2
                    className="text-blue-600 fill-blue-600 drop-shadow-lg -translate-x-[4px] -translate-y-[4px]"
                    size={48}
                  />
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mb-6 shadow-inner">
                <MonitorPlay size={40} />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-4">{slide.title || "Interactive Activity"}</h3>
              <p className="text-xl leading-relaxed text-slate-600 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                {slide.htmlDescription}
              </p>
              <button className="mt-8 bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center gap-2 border-2 border-black/70 shadow-md shadow-black/60">
                <Play size={20} fill="currentColor" />
                Start Activity
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
