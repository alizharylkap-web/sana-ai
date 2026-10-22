import React, { useState } from 'react';
import {
  Folder,
  FileCode,
  Download,
  Copy,
  Check,
  Search,
  Terminal,
  Layers,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import JSZip from 'jszip';
import { BOT_FILES, BotFile } from '../data/botFilesData.ts';

export const CodeExplorer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<BotFile>(BOT_FILES[0]);
  const [copied, setCopied] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const categories = [
    { id: 'all', label: 'Все файлы' },
    { id: 'core', label: 'Ядро и Webhook' },
    { id: 'handlers', label: 'Обработчики (Handlers)' },
    { id: 'services', label: 'Сервисы (Services)' },
    { id: 'repositories', label: 'Репозитории (DB)' },
    { id: 'models', label: 'Модели SQLAlchemy' },
    { id: 'middlewares', label: 'Middleware' },
    { id: 'prompts', label: 'Промпты' },
    { id: 'devops', label: 'Docker & Конфиг' },
    { id: 'tests', label: 'Тесты pytest' },
  ];

  const filteredFiles = BOT_FILES.filter((file) => {
    const matchCat = activeCategory === 'all' || file.category === activeCategory;
    const matchSearch =
      file.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleCopyCode = () => {
    navigator.clipboard.writeText(selectedFile.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();

      // Add each file to ZIP archive
      for (const file of BOT_FILES) {
        zip.file(file.path, file.code);
      }

      // Generate zip file blob
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sana-ai-telegram-bot.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to create ZIP:', err);
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0d1117] text-slate-200 overflow-hidden">
      {/* Left Sidebar: File Tree & Categories */}
      <div className="w-80 border-r border-slate-800 bg-[#161b22] flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Folder className="w-5 h-5 text-cyan-400" />
              <span className="font-bold text-white text-sm">Репозиторий бота</span>
            </div>
            <span className="text-[11px] font-mono bg-cyan-900/40 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800">
              {BOT_FILES.length} файлов
            </span>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Поиск по файлам..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0d1117] text-xs text-white pl-9 pr-3 py-2 rounded-lg border border-slate-700 focus:outline-hidden focus:border-cyan-500"
            />
          </div>

          {/* Download ZIP button */}
          <button
            onClick={handleDownloadZip}
            disabled={isZipping}
            className="w-full py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold text-xs transition flex items-center justify-center gap-2 shadow-sm"
          >
            <Download className="w-4 h-4" />
            {isZipping ? 'Формирование архива...' : 'Скачать проект (.ZIP)'}
          </button>
        </div>

        {/* Categories Bar */}
        <div className="px-3 py-2 border-b border-slate-800 flex gap-1.5 overflow-x-auto no-scrollbar text-xs">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              className={`px-2 py-1 rounded-md shrink-0 text-[11px] transition ${
                activeCategory === c.id
                  ? 'bg-slate-700 text-white font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredFiles.map((file) => {
            const isSelected = selectedFile.path === file.path;
            return (
              <button
                key={file.path}
                onClick={() => setSelectedFile(file)}
                className={`w-full text-left p-2.5 rounded-lg transition flex items-start gap-2.5 ${
                  isSelected
                    ? 'bg-cyan-950/60 border border-cyan-500/40 text-cyan-300'
                    : 'hover:bg-slate-800/60 text-slate-300'
                }`}
              >
                <FileCode className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-cyan-400' : 'text-slate-500'}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-mono font-medium truncate">{file.path}</div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">{file.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Code Viewer */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0d1117]">
        {/* Header with copy & path */}
        <div className="h-14 px-6 border-b border-slate-800 bg-[#161b22] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-sm font-semibold text-white truncate">
              {selectedFile.path}
            </span>
            <span className="text-xs text-slate-400 hidden sm:inline truncate">
              — {selectedFile.description}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyCode}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition flex items-center gap-1.5 border border-slate-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Скопировано!' : 'Копировать'}</span>
            </button>
          </div>
        </div>

        {/* Code Content */}
        <div className="flex-1 overflow-auto p-6 font-mono text-xs leading-relaxed text-slate-300 bg-[#0d1117] select-text">
          <pre className="whitespace-pre">
            <code>{selectedFile.code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
