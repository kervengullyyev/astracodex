import { useState, useEffect } from 'react';
import { Save, FileJson, BookOpen, AlertCircle, CheckCircle2, Database, ChevronDown, ChevronRight, Layers, Trash2, Plus, Upload } from 'lucide-react';

const ValueEditor = ({ value, onChange, fieldName = '', path = '', onUpload }: any) => {
  if (value === null || value === undefined) {
    return <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />;
  }
  
  if (Array.isArray(value)) {
    return (
      <div className="space-y-4 mt-2">
        {value.map((item, idx) => {
          let bgClass = "bg-slate-800/40 border-slate-700/60";
          
          if (path === 'sections' && typeof item === 'object' && item !== null) {
            if (item.type === 'text') {
              bgClass = "bg-white border-slate-300";
            } else if (item.type === 'image') {
              bgClass = "bg-[#23e857] border-emerald-200";
            } else if (item.type === 'interactive') {
              bgClass = "bg-[#e8c123] border-orange-200";
            }
          }

          return (
            <div key={idx} className={`${bgClass} p-5 rounded-xl border relative group shadow-sm transition-colors overflow-hidden`}>
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-700/50">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-800 px-2 py-1 rounded-md">Item {idx + 1}</span>
                <button onClick={() => {
                  const newData = [...value];
                  newData.splice(idx, 1);
                  onChange(newData);
                }} className="text-slate-500 hover:text-rose-400 transition-colors p-1.5 rounded-md hover:bg-rose-500/10">
                  <Trash2 size={16} />
                </button>
              </div>
              <ValueEditor path={`${path}.${idx}`} value={item} onUpload={onUpload} onChange={(val: any) => {
                const newData = [...value];
                newData[idx] = val;
                onChange(newData);
              }} />
            </div>
          );
        })}
        <button onClick={() => {
          let emptyItem: any = '';
          if (value.length > 0) {
            if (typeof value[0] === 'object' && value[0] !== null) {
              emptyItem = Array.isArray(value[0]) ? [] : {};
              if (!Array.isArray(value[0])) {
                for (let k in value[0]) {
                  emptyItem[k] = typeof value[0][k] === 'number' ? 0 : typeof value[0][k] === 'boolean' ? false : '';
                }
              }
            } else if (typeof value[0] === 'number') {
              emptyItem = 0;
            } else if (typeof value[0] === 'boolean') {
              emptyItem = false;
            }
          } else {
             emptyItem = {};
          }
          onChange([...value, emptyItem]);
        }} className="flex items-center gap-2 text-sm font-semibold text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors py-2 px-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 w-fit">
          <Plus size={16} /> Add New Item
        </button>
      </div>
    );
  }
  
  if (typeof value === 'object') {
    return (
      <div className="grid grid-cols-2 gap-4 mt-1">
        {Object.keys(value).map(key => {
          const currentPath = path ? `${path}.${key}` : key;
          
          if ((key === 'id' || key === 'order') && currentPath.match(/^sections\.\d+\.(id|order)$/)) {
            return null;
          }

          const isNested = typeof value[key] === 'object' && value[key] !== null;
          const isXY = key === 'x' || key === 'y';
          
          return (
            <div key={key} className={`${isNested ? 'col-span-2 border-l-2 border-indigo-500/30 pl-5 py-2 bg-slate-800/10 rounded-r-xl' : isXY ? 'col-span-1' : 'col-span-2'}`}>
              <label className="text-xs font-bold text-slate-400 tracking-wide mb-2 block flex items-center gap-2">
                <span className="text-indigo-400/50">{'>'}</span> {key}
              </label>
              <ValueEditor path={currentPath} fieldName={key} value={value[key]} onUpload={onUpload} onChange={(val: any) => {
                onChange({ ...value, [key]: val });
              }} />
            </div>
          );
        })}
      </div>
    );
  }
  
  if (typeof value === 'boolean') {
    return (
      <label className="flex items-center gap-3 cursor-pointer mt-1">
        <div className={`w-11 h-6 rounded-full p-1 transition-colors shadow-inner ${value ? 'bg-indigo-500' : 'bg-slate-700'}`}>
          <div className={`w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${value ? 'translate-x-5' : 'translate-x-0'}`} />
        </div>
        <input type="checkbox" className="hidden" checked={value} onChange={e => onChange(e.target.checked)} />
        <span className="text-sm font-medium text-slate-300">{value ? 'True' : 'False'}</span>
      </label>
    );
  }
  
  if (typeof value === 'number') {
    return <input type="number" value={value} onChange={e => onChange(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm" />;
  }
  
  if (typeof value === 'string' && path.match(/^sections\.\d+\.type$/)) {
    return (
      <select 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm"
      >
        <option value="text">text</option>
        <option value="image">image</option>
        <option value="interactive">interactive</option>
      </select>
    );
  }

  if (typeof value === 'string' && fieldName === 'interactionType') {
    return (
      <select 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm"
      >
        <option value="show">show</option>
        <option value="clickable">clickable</option>
      </select>
    );
  }

  if (typeof value === 'string' && (fieldName.toLowerCase().includes('source') || fieldName.toLowerCase().includes('image') || fieldName.toLowerCase().includes('icon')) && !fieldName.toLowerCase().includes('description')) {
    return (
      <div className="flex gap-2">
        <input type="text" value={value} onChange={e => onChange(e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm" />
        {onUpload && (
          <label className="flex items-center justify-center p-2.5 bg-slate-800 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors shadow-sm group">
            <Upload size={18} className="text-indigo-400 group-hover:scale-110 transition-transform" />
            <input 
              type="file" 
              className="hidden" 
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const uploadedName = await onUpload(file);
                  if (uploadedName) onChange(uploadedName);
                }
              }} 
            />
          </label>
        )}
      </div>
    );
  }
  
  if (typeof value === 'string' && (value.length > 50 || fieldName === 'text' || fieldName === 'description' || fieldName === 'imageDescription')) {
    return <textarea value={value} onChange={e => onChange(e.target.value)} rows={4} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-y custom-scrollbar shadow-sm leading-relaxed" />;
  }
  
  return <input type="text" value={value} onChange={e => onChange(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm" />;
};

export default function AdminPage() {
  const [coursesData, setCoursesData] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<{ type: 'courses' | 'lesson', courseId?: string, lessonId?: number, title: string } | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const res = await fetch('/api/courses');
      const text = await res.text();
      let parsed = {};
      try { parsed = JSON.parse(text); } catch (e) {}
      setCoursesData(parsed);
      setLoading(false);
      
      setSelectedFile({ type: 'courses', title: 'courses.json' });
      setParsedData(parsed);
      setOriginalContent(JSON.stringify(parsed));
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Failed to load courses' });
      setLoading(false);
    }
  };

  const handleSelectCourses = async () => {
    try {
      const res = await fetch('/api/courses');
      const text = await res.text();
      let parsed = {};
      try { parsed = JSON.parse(text); } catch (e) {}
      
      setSelectedFile({ type: 'courses', title: 'courses.json' });
      setParsedData(parsed);
      setOriginalContent(JSON.stringify(parsed));
      setStatus(null);
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to load courses.json' });
    }
  };

  const handleSelectLesson = async (courseId: string, lessonId: number, lessonTitle: string) => {
    try {
      const res = await fetch(`/api/lesson/${courseId}/${lessonId}`);
      const text = await res.text();
      let parsed = {};
      try { parsed = JSON.parse(text); } catch (e) {}
      
      setSelectedFile({ type: 'lesson', courseId, lessonId, title: `${courseId} - Lesson ${lessonId} (${lessonTitle})` });
      setParsedData(parsed);
      setOriginalContent(JSON.stringify(parsed));
      setStatus(null);
    } catch (err) {
      setStatus({ type: 'error', message: `Failed to load lessonContent.json` });
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!selectedFile || selectedFile.type !== 'lesson') {
      setStatus({ type: 'error', message: 'Please select a lesson first' });
      return null;
    }

    const extension = file.name.split('.').pop();
    const nameWithoutExt = file.name.replace(`.${extension}`, '');
    const newName = window.prompt('Enter new filename:', nameWithoutExt);
    
    if (newName === null) return null; // Cancelled
    
    const finalName = newName.includes('.') ? newName : `${newName}.${extension}`;
    
    try {
      const res = await fetch(`/api/upload/${selectedFile.courseId}/${selectedFile.lessonId}`, {
        method: 'POST',
        headers: {
          'x-filename': finalName
        },
        body: file
      });
      
      if (res.ok) {
        setStatus({ type: 'success', message: `Uploaded ${finalName}` });
        setTimeout(() => setStatus(null), 3000);
        return finalName;
      } else {
        throw new Error('Upload failed');
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'Upload failed' });
      return null;
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;

    setSaving(true);
    setStatus(null);

    try {
      let dataToSave = { ...parsedData };
      if (selectedFile.type === 'lesson' && Array.isArray(dataToSave.sections)) {
        dataToSave.sections = dataToSave.sections.map((section: any, index: number) => ({
          ...section,
          id: `section-${index + 1}`,
          order: index + 1
        }));
      }

      const fileContent = JSON.stringify(dataToSave, null, 2);
      const url = selectedFile.type === 'courses' 
        ? '/api/courses' 
        : `/api/lesson/${selectedFile.courseId}/${selectedFile.lessonId}`;
        
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: fileContent
      });

      if (res.ok) {
        setStatus({ type: 'success', message: 'Saved successfully!' });
        setParsedData(dataToSave);
        setOriginalContent(JSON.stringify(dataToSave));
        if (selectedFile.type === 'courses') {
          setCoursesData(dataToSave);
        }
      } else {
        throw new Error('Failed to save');
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Error saving file' });
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const toggleCourse = (courseId: string) => {
    setExpandedCourses(prev => ({ ...prev, [courseId]: !prev[courseId] }));
  };

  const hasChanges = JSON.stringify(parsedData) !== originalContent;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-500">Loading...</div>;
  }

  return (
    <div className="flex h-screen bg-slate-900 text-slate-200 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 bg-slate-800 border-r border-slate-700 flex flex-col h-full overflow-hidden shrink-0 shadow-2xl z-10">
        <div className="p-5 border-b border-slate-700 flex items-center gap-3 bg-slate-800/80 backdrop-blur-sm">
          <img src="/logo.png" alt="AstraCodex" className="h-8 w-auto" />
          <div>
            <h1 className="font-bold text-lg text-white tracking-tight leading-tight">Content Manager</h1>
            <p className="text-xs text-slate-400 font-medium">Admin Panel</p>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          <button 
            onClick={handleSelectCourses}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all mb-6 border ${selectedFile?.type === 'courses' ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30 shadow-inner' : 'text-slate-300 border-transparent hover:bg-slate-700/50 hover:text-white'}`}
          >
            <FileJson size={18} className={selectedFile?.type === 'courses' ? 'text-indigo-400' : 'text-slate-400'} />
            courses.json
          </button>

          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 px-2">Course Lessons</div>
          
          <div className="flex flex-col gap-1">
            {coursesData?.courses?.map((course: any) => (
              <div key={course.id} className="mb-1">
                <button 
                  onClick={() => toggleCourse(course.id)}
                  className="w-full flex items-center gap-2 px-2 py-2.5 rounded-lg text-sm transition-colors text-slate-300 hover:bg-slate-700/50 hover:text-white group"
                >
                  <div className="flex items-center justify-center w-5 h-5 rounded bg-slate-800 border border-slate-700 group-hover:border-slate-500 transition-colors">
                    {expandedCourses[course.id] ? <ChevronDown size={14} className="text-slate-300" /> : <ChevronRight size={14} className="text-slate-400" />}
                  </div>
                  <Layers size={16} className="text-slate-400" />
                  <span className="truncate font-medium">{course.name}</span>
                </button>
                
                {expandedCourses[course.id] && (
                  <div className="ml-5 pl-4 border-l-2 border-slate-700/50 mt-1 mb-3 flex flex-col gap-1">
                    {course.lessons?.map((lesson: any) => {
                      const isSelected = selectedFile?.type === 'lesson' && selectedFile.courseId === course.id && selectedFile.lessonId === lesson.id;
                      return (
                        <button
                          key={lesson.id}
                          onClick={() => handleSelectLesson(course.id, lesson.id, lesson.title)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left ${isSelected ? 'bg-indigo-500/20 text-indigo-200 font-medium translate-x-1' : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'}`}
                        >
                          <BookOpen size={14} className={isSelected ? 'text-indigo-400' : 'text-slate-500'} />
                          <span className="truncate flex-1">Lesson {lesson.id}: {lesson.title}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col bg-[#0f172a] h-full overflow-hidden relative">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none"></div>

        {selectedFile ? (
          <>
            <div className="h-16 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-800 rounded-lg border border-slate-700">
                  <FileJson className="text-indigo-400" size={18} />
                </div>
                <h2 className="font-semibold text-slate-200 tracking-wide">{selectedFile.title}</h2>
                {hasChanges && <span className="flex items-center ml-2 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-xs font-medium border border-amber-500/20">Unsaved Changes</span>}
              </div>
              
              <div className="flex items-center gap-4">
                {status && (
                  <div className={`flex items-center gap-2 text-sm font-medium ${status.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {status.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    {status.message}
                  </div>
                )}
                
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    hasChanges 
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/40 hover:-translate-y-0.5 active:translate-y-0' 
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  }`}
                >
                  <Save size={16} />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 relative z-10 custom-scrollbar">
              <div className="max-w-4xl mx-auto bg-[#1e293b] rounded-2xl border border-slate-700/50 shadow-xl p-8">
                {parsedData !== null && typeof parsedData === 'object' ? (
                  <ValueEditor path="" value={parsedData} onUpload={handleImageUpload} onChange={setParsedData} />
                ) : (
                  <p className="text-slate-500">Invalid or empty JSON data.</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 z-10">
            <div className="w-24 h-24 rounded-full bg-slate-800/50 border border-slate-700/50 flex items-center justify-center mb-6">
              <Database size={40} className="text-slate-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-300 mb-2">Select a file</h2>
            <p className="text-sm font-medium">Choose a file from the sidebar to edit its JSON content</p>
          </div>
        )}
      </div>
    </div>
  );
}
