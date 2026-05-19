import { useState, useRef, useEffect, type FormEvent } from 'react';
import { 
  ChevronDown, ArrowRight, X, Play, CheckCircle2, CircleDashed, Lock, ChevronRight,
  LogOut, ShieldCheck, Volume2, BarChart3, User
} from 'lucide-react';
import { Routes, Route, useNavigate } from 'react-router-dom';

import coursesData from './data/courses.json';
import LessonPage from './pages/LessonPage.tsx';
import AdminPage from './pages/AdminPage.tsx';
import {
  groupWebcamAnalyses,
  readSavedSummaries,
  readWebcamAnalyses,
  saveSummaries,
  sortReportDates,
  summarizeWebcamAnalyses,
} from './pages/dashboard/reports';
import { themeStyles } from './pages/dashboard/theme';
import type { Course, WebcamAnalysis } from './pages/dashboard/types';
import { getStoredLearnerName, saveStoredLearnerName } from './utils/learnerName';

const subjects: Course[] = coursesData.courses;

function Dashboard() {
  const [activeSubject, setActiveSubject] = useState<Course | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [learnerName, setLearnerName] = useState(getStoredLearnerName);
  const [pendingLearnerName, setPendingLearnerName] = useState('');
  const [ttsProvider, setTtsProvider] = useState(localStorage.getItem('tts_provider') || 'Kokoro');
  const [webcamAnalyses, setWebcamAnalyses] = useState<WebcamAnalysis[]>([]);
  const [summaries, setSummaries] = useState<Record<string, string>>(readSavedSummaries);
  const [loadingSummaries, setLoadingSummaries] = useState<Record<string, boolean>>({});
  const profileRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const groupedAnalyses = groupWebcamAnalyses(webcamAnalyses);
  const sortedDates = sortReportDates(groupedAnalyses);

  const openReport = () => {
    setWebcamAnalyses(readWebcamAnalyses());
    setIsReportOpen(true);
  };

  const handleTtsChange = (provider: string) => {
    setTtsProvider(provider);
    localStorage.setItem('tts_provider', provider);
  };

  const handleSaveLearnerName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = saveStoredLearnerName(pendingLearnerName);
    if (!nextName) return;
    setLearnerName(nextName);
  };

  const handleSummarize = async (date: string, title: string, entries: WebcamAnalysis[]) => {
    const key = `${date}-${title}`;
    if (loadingSummaries[key]) return;
    
    setLoadingSummaries(prev => ({ ...prev, [key]: true }));
    
    try {
      const summary = await summarizeWebcamAnalyses(date, title, entries);
      setSummaries(prev => saveSummaries({ ...prev, [key]: summary }));
    } catch (err) {
      console.error("Error generating summary:", err);
    } finally {
      setLoadingSummaries(prev => ({ ...prev, [key]: false }));
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // We find the last used course to feature on the dashboard hero
  const lastLessonData = localStorage.getItem('astracodex_last_lesson');
  const lastLessonInfo = lastLessonData ? JSON.parse(lastLessonData) : null;
  const featuredCourse = subjects.find(s => s.id === (lastLessonInfo?.courseId || 'mathematics')) || subjects[0];
  const t = activeSubject ? themeStyles[activeSubject.themeColor] : themeStyles.indigo;

  return (
    <div className="h-screen w-full bg-[#FFE1C4] p-3 sm:p-3 font-sans text-slate-900 overflow-hidden">
      {/* Background layer */}
      <div className={`w-full h-full bg-[#FFE1C4] rounded-[2rem] sm:rounded-[1rem] flex flex-col relative overflow-hidden transition-all duration-300 ${activeSubject ? 'blur-sm scale-[0.98] opacity-80' : ''}`}>
        {/* Navbar */}
        <nav className="w-full bg-[#FFE1C4] px-4 py-1 sm:px-4 sm:py-1 flex items-center justify-between z-20">
          <div className="flex items-end gap-2">
            <img src="/logo.png" alt="AstraCodex" className="h-9 w-auto" />
            <span className="text-xl font-bold tracking-tight text-slate-800">AstraCodex</span>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="relative" ref={profileRef}>
              <div 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className={`group flex items-center gap-3 cursor-pointer rounded-full bg-white/50 p-2 text-slate-700 transition-all duration-300 backdrop-blur-md overflow-hidden border-2 border-black/70 shadow-md shadow-black/60 ${isProfileOpen ? 'bg-white/80' : 'hover:bg-white/80'}`}
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 border-2 border-black/50 shadow-sm flex items-center justify-center text-indigo-600">
                    <User size={20} className="stroke-[2.5]" />
                  </div>
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-start -space-y-1">
                    <span className="font-bold text-sm">{learnerName || 'Learner'}</span>
                  </div>
                  <ChevronDown size={16} className={`text-slate-400 transition-transform duration-300 ${isProfileOpen ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Profile Dropdown Menu */}
              {isProfileOpen && (
                <div className="absolute right-0 mt-3 w-64 bg-white/90 backdrop-blur-md border-2 border-black/70 shadow-md shadow-black/60 rounded-[1.5rem] py-2 z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-3 border-b border-slate-50 mb-1">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Account</p>
                    <p className="text-sm font-bold text-slate-800 truncate">{learnerName || 'Learner'}</p>
                  </div>
                  
                  <div className="px-2">
                    

                    <button 
                      onClick={() => {
                        setIsProfileOpen(false);
                        openReport();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-indigo-600 rounded-xl transition-colors group"
                    >
                      <div className="p-1.5 bg-slate-50 group-hover:bg-indigo-50 rounded-lg transition-colors">
                        <BarChart3 size={16} />
                      </div>
                      Report
                    </button>

                    <button 
                      onClick={() => {
                        setIsProfileOpen(false);
                        navigate('/admin');
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-indigo-600 rounded-xl transition-colors group"
                    >
                      <div className="p-1.5 bg-slate-50 group-hover:bg-indigo-50 rounded-lg transition-colors">
                        <ShieldCheck size={16} />
                      </div>
                      Admin Panel
                    </button>

                    <div className="h-px bg-slate-50 my-1 mx-2"></div>

                    <button 
                      onClick={() => {
                        localStorage.clear();
                        window.location.reload();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 rounded-xl transition-colors group"
                    >
                      <div className="p-1.5 bg-rose-50 group-hover:bg-rose-100 rounded-lg transition-colors">
                        <LogOut size={16} />
                      </div>
                      Logout
                    </button>
                  </div>

                  {/* TTS Engine Selector */}
                  <div className="mt-1 px-4 py-3 bg-slate-50/50 rounded-b-2xl border-t border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                      <Volume2 size={12} className="text-slate-400" />
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">TTS Engine</p>
                    </div>
                    <div className="flex bg-white/70 border-2 border-black/60 rounded-xl p-1 gap-1 shadow-sm">
                      <button 
                        onClick={() => handleTtsChange('Kokoro')}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${ttsProvider === 'Kokoro' ? 'bg-indigo-600 text-white border-2 border-black/70 shadow-md shadow-black/60' : 'text-slate-500 hover:bg-white/80'}`}
                      >
                        Kokoro
                      </button>
                      <button 
                        onClick={() => handleTtsChange('ElevenLabs')}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${ttsProvider === 'ElevenLabs' ? 'bg-indigo-600 text-white border-2 border-black/70 shadow-md shadow-black/60' : 'text-slate-500 hover:bg-white/80'}`}
                      >
                        ElevenLabs
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 w-full overflow-y-auto px-2 sm:px-6 pb-6 pt-3 custom-scrollbar">

          {/* Hero Section (Dashboard) */}
          <section className="bg-white/50 backdrop-blur-md border-2 border-black/70 shadow-md shadow-black/60 rounded-[2rem] px-6 sm:px-10 py-6 flex items-center justify-between relative overflow-hidden mb-8">
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-white/60 rounded-full blur-3xl"></div>
            
            <div className="max-w-xl z-10">
              <span className="text-indigo-600 font-semibold text-sm mb-2 block tracking-wide">
                Continue Learning
              </span>
              {(() => {
                const activeLesson = lastLessonInfo && featuredCourse.id === lastLessonInfo.courseId
                  ? featuredCourse.lessons.find(l => l.id.toString() === lastLessonInfo.lessonId) || featuredCourse.lessons[0]
                  : featuredCourse.lessons.find(l => l.status === 'In Progress') || featuredCourse.lessons[0];

                const storedProgress = localStorage.getItem(`astracodex_progress_${featuredCourse.id}_${activeLesson.id}`);
                const progress = storedProgress ? parseInt(storedProgress) : (activeLesson.progress || 0);

                return (
                  <>
                    <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
                      {featuredCourse.name}
                    </h2>
                    <p className="text-slate-500 text-lg mb-8">
                      You were solving <span className="font-semibold text-indigo-600">{activeLesson.title}</span>
                    </p>
                    
                    <div className="mb-8">
                      <div className="flex justify-between text-sm font-medium text-slate-500 mb-2">
                        <span>{progress}% Complete</span>
                      </div>
                      <div className="w-64 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${progress}%` }}></div>
                      </div>
                    </div>
                  </>
                );
              })()}
              
              <button 
                onClick={() => {
                  const inProgressLesson = featuredCourse.lessons.find(l => l.status === 'In Progress') || featuredCourse.lessons[0];
                  navigate(`/lesson/${featuredCourse.id}/${inProgressLesson.id}`);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-transform active:scale-95 border-2 border-black/70 shadow-md shadow-black/60"
              >
                Continue Learning
                <ArrowRight size={18} />
              </button>
            </div>
            
            <div className="hidden lg:block relative z-10 mr-10">
              <img 
                src="/assets/hero_assets.png" 
                alt="Learning Assets" 
                className="w-[380px] object-contain drop-shadow-2xl mix-blend-multiply"
              />
            </div>
          </section>

          {/* Explore Subjects */}
          <section>
            <h3 className="text-xl font-bold text-slate-900 mb-6 tracking-tight">
              Explore Subjects
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {subjects.map((subject) => (
                <div 
                  key={subject.id} 
                  onClick={() => setActiveSubject(subject)}
                  className={`bg-white/50 backdrop-blur-md border-2 border-black/70 rounded-[2rem] p-6 relative group cursor-pointer shadow-md shadow-black/60 transition-all hover:-translate-y-1 flex flex-col h-64 overflow-hidden`}
                >
                  <div className={`absolute inset-0 opacity-40 ${subject.bgColor}`}></div>
                  
                  <div className="flex-1 flex items-center justify-center -mt-4 relative z-10">
                    <img 
                      src={subject.icon} 
                      alt={subject.name} 
                      className="w-36 h-36 object-contain mix-blend-multiply group-hover:scale-110 transition-transform duration-300"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between mt-auto relative z-10">
                    <span className="font-bold text-slate-800">
                      {subject.name}
                    </span>
                    <button className={`w-8 h-8 rounded-full ${subject.btnColor} ${subject.arrowColor} flex items-center justify-center border-2 border-black/70 shadow-md shadow-black/60 group-hover:scale-110 transition-transform`}>
                      <ArrowRight size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>

      {/* Modal Overlay */}
      {activeSubject && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/25 backdrop-blur-sm"
          onClick={() => setActiveSubject(null)}
        >
          <div 
            className="bg-[#FFE1C4] w-full max-w-4xl rounded-[2rem] border-2 border-black/70 shadow-md shadow-black/60 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Modal Header */}
            <div className="flex items-center justify-end px-6 py-4">
              <button 
                onClick={() => setActiveSubject(null)}
                className="p-2 text-slate-600 hover:text-slate-900 bg-white/50 hover:bg-white/80 rounded-full transition-colors border-2 border-black/70 shadow-md shadow-black/60"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content Scrollable Area */}
            <div className="overflow-y-auto px-6 py-4 flex-1 custom-scrollbar">
              
              {/* Modal Hero */}
              <div className={`${t.bg} rounded-[2rem] border-2 border-black/70 shadow-md shadow-black/60 p-6 flex flex-col md:flex-row items-center justify-between relative overflow-hidden mb-6 bg-white/50`}>
                <div className="absolute inset-0 bg-gradient-to-r from-white/40 to-transparent"></div>
                
                <div className="relative z-10 flex-1 w-full md:w-auto mb-8 md:mb-0">
                  <span className={`${t.text} font-medium text-sm mb-2 block tracking-wide`}>
                    Continue your lesson
                  </span>
                  <h2 className="text-3xl font-extrabold text-slate-900 mb-1">
                    {activeSubject.name}
                  </h2>
                  {(() => {
                    const activeLesson = (lastLessonInfo && activeSubject.id === lastLessonInfo.courseId)
                      ? activeSubject.lessons.find(l => l.id.toString() === lastLessonInfo.lessonId) || activeSubject.lessons[0]
                      : activeSubject.lessons.find(l => l.status === 'In Progress') || activeSubject.lessons[0];

                    const storedProgress = localStorage.getItem(`astracodex_progress_${activeSubject.id}_${activeLesson.id}`);
                    const progress = storedProgress ? parseInt(storedProgress) : (activeLesson.progress || 0);

                    return (
                      <>
                        <h3 className={`text-4xl font-extrabold ${t.text} mb-4`}>
                          {activeLesson.title}
                        </h3>
                        <p className="text-slate-500 mb-8">
                          Pick up right where you left off
                        </p>
                        
                        <div className="max-w-sm mb-8">
                          <div className="flex items-center gap-4 mb-2">
                            <div className={`flex-1 h-2.5 ${t.track} rounded-full overflow-hidden`}>
                              <div className={`h-full ${t.fill} rounded-full`} style={{ width: `${progress}%` }}></div>
                            </div>
                            <span className="text-sm font-bold text-slate-700">{progress}%</span>
                          </div>
                          <p className="text-sm text-slate-500">{activeSubject.lessonsCompleted} of {activeSubject.totalLessons} lessons completed</p>
                        </div>
                        
                        <button 
                          onClick={() => {
                            navigate(`/lesson/${activeSubject.id}/${activeLesson.id}`);
                          }}
                          className={`${t.fill} ${t.hover} text-white px-6 py-3.5 rounded-xl font-medium flex items-center gap-2 transition-transform active:scale-95 border-2 border-black/70 shadow-md shadow-black/60`}
                        >
                          <Play size={18} fill="currentColor" />
                          Continue Lesson
                        </button>
                      </>
                    );
                  })()}
                </div>
                
                <div className="relative z-10 w-full md:w-1/2 flex justify-end">
                  <img 
                    src={activeSubject.heroImage} 
                    alt={`${activeSubject.name} Elements`} 
                    className={`w-full max-w-[320px] object-contain mix-blend-multiply drop-shadow-xl ${activeSubject.id !== 'mathematics' ? 'opacity-80 scale-90' : ''}`}
                  />
                </div>
              </div>

              {/* Lessons List */}
              <div>
                <h4 className="text-xl font-bold text-slate-900 mb-4 tracking-tight">Lessons</h4>
                
                <div className="flex flex-col gap-3">
                  {activeSubject.lessons.map((lesson) => (
                    <div 
                      key={lesson.id} 
                      onClick={() => lesson.status !== 'Locked' && navigate(`/lesson/${activeSubject.id}/${lesson.id}`)}
                      className={`flex items-center px-4 py-3 rounded-2xl bg-white/50 border-2 border-black/60 ${t.borderHover} hover:bg-white/80 transition-colors group cursor-pointer shadow-sm`}
                    >
                      {/* Number circle */}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm mr-4 flex-shrink-0
                        ${lesson.status === 'Completed' ? 'bg-green-50 text-green-600' : 
                          lesson.status === 'In Progress' ? `${t.circleBg} ${t.text}` : 
                          'bg-slate-100 text-slate-500'}`}
                      >
                        {lesson.id}
                      </div>
                      
                      {/* Lesson details */}
                      <div className="flex-1 min-w-0 pr-4">
                        <h5 className={`font-bold truncate mb-1 ${lesson.status === 'In Progress' ? t.text : 'text-slate-800'}`}>
                          {lesson.title}
                        </h5>
                        <p className="text-sm text-slate-500 truncate">
                          {lesson.description}
                        </p>
                      </div>
                      
                      {/* Status indicator */}
                      <div className="flex items-center gap-4 flex-shrink-0">
                        {/* Status Label */}
                        <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                          ${lesson.status === 'Completed' ? 'bg-green-50 text-green-600' : 
                            lesson.status === 'In Progress' ? `${t.circleBg} ${t.text}` : 
                            'bg-slate-100 text-slate-500'}`}
                        >
                          {lesson.status === 'Completed' && <CheckCircle2 size={14} />}
                          {lesson.status === 'In Progress' && <CircleDashed size={14} />}
                          {lesson.status === 'Locked' && <Lock size={14} />}
                          {lesson.status}
                        </div>
                        
                        {/* Progress text for In Progress */}
                        {lesson.status === 'In Progress' && (
                          <span className="text-sm font-bold text-slate-700 hidden sm:block">
                            {lesson.progress}%
                          </span>
                        )}
                        
                        <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
            </div>
          </div>
        </div>
      )}
      {/* Report Modal */}
      {isReportOpen && (
        <div 
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/25 backdrop-blur-md"
          onClick={() => setIsReportOpen(false)}
        >
          <div 
            className="bg-[#FFE1C4] w-full max-w-md rounded-[2rem] border-2 border-black/70 shadow-md shadow-black/60 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b-2 border-black/30 flex items-center justify-between bg-white/40">
              <h3 className="font-bold text-slate-900">Learning Progress Report</h3>
              <button 
                onClick={() => setIsReportOpen(false)}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white/80 rounded-full transition-all border-2 border-black/70 shadow-md shadow-black/60"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {sortedDates.length > 0 ? (
                <div className="space-y-8">
                  <div className="bg-white/50 rounded-2xl p-4 mb-2 border-2 border-black/60 shadow-sm">
                    <p className="text-indigo-900 font-semibold text-sm flex items-center gap-2">
                      <ShieldCheck size={16} />
                      AI Mentor Insights
                    </p>
                    <p className="text-indigo-700/80 text-xs mt-1">
                      Historical analysis of your focus and engagement during lessons.
                    </p>
                  </div>

                  {sortedDates.map((date) => (
                    <div key={date} className="space-y-6">
                      <div className="border-b border-slate-100 pb-2">
                        <h4 className="font-extrabold text-slate-900 text-sm">{date}</h4>
                      </div>
                      
                      {Object.keys(groupedAnalyses[date]).map((title) => (
                        <div key={title} className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                              <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                {title}
                              </h5>
                            </div>
                            <button 
                              onClick={() => handleSummarize(date, title, groupedAnalyses[date][title])}
                              disabled={loadingSummaries[`${date}-${title}`]}
                              className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest cursor-pointer hover:text-indigo-700 transition-colors flex items-center gap-1 disabled:opacity-50"
                            >
                              {loadingSummaries[`${date}-${title}`] ? (
                                <>
                                  <CircleDashed size={10} className="animate-spin" />
                                  Summarizing...
                                </>
                              ) : (
                                'Summarize'
                              )}
                            </button>
                          </div>

                          {summaries[`${date}-${title}`] ? (
                            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-4 text-white border-2 border-black/70 shadow-md shadow-black/60 animate-in fade-in slide-in-from-top-2 duration-300">
                              <div className="flex items-center gap-2 mb-2">
                                <ShieldCheck size={14} className="text-indigo-100" />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-100">Parent Summary</span>
                              </div>
                              <p className="text-sm font-medium leading-relaxed">
                                {summaries[`${date}-${title}`]}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-3 pl-4 border-l border-slate-100 ml-1">
                              {groupedAnalyses[date][title].map((entry, idx) => (
                                <div key={idx} className="bg-white/70 border-2 border-black/40 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow group">
                                  <p className="text-sm text-slate-700 leading-relaxed italic">
                                    "{entry.analysis}"
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
                    <BarChart3 className="text-slate-300" size={40} />
                  </div>
                  <p className="text-slate-500 font-medium">No webcam analysis found</p>
                  <p className="text-slate-400 text-xs mt-1 max-w-[200px] mx-auto">
                    Complete some interactive lessons to see AI insights here.
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-white/40 border-t-2 border-black/30 flex justify-end">
              <button 
                onClick={() => setIsReportOpen(false)}
                className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors border-2 border-black/70 shadow-md shadow-black/60 active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {!learnerName && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/25 backdrop-blur-md p-4">
          <form
            onSubmit={handleSaveLearnerName}
            className="w-full max-w-md rounded-[2rem] border-2 border-black/70 bg-[#FFE1C4] p-6 shadow-md shadow-black/60"
          >
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-2">Welcome to AstraCodex</p>
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">What should Einstein call you?</h2>
            </div>
            <input
              autoFocus
              value={pendingLearnerName}
              onChange={(event) => setPendingLearnerName(event.target.value)}
              maxLength={40}
              className="w-full rounded-2xl border-2 border-black/70 bg-white/80 px-4 py-3 text-lg font-semibold text-slate-900 shadow-sm outline-none transition focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
              placeholder="Your name"
            />
            <button
              type="submit"
              disabled={!pendingLearnerName.trim()}
              className="mt-4 w-full rounded-2xl border-2 border-black/70 bg-indigo-600 px-5 py-3 font-bold text-white shadow-md shadow-black/60 transition active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
            >
              Start Learning
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function App() {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/lesson/:courseId/:lessonId" element={<LessonPage onBack={() => navigate('/')} />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  );
}

export default App;
