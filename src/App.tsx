import React, { useState } from 'react';
import {
  MessageSquare,
  Code2,
  Database,
  Shield,
  Layers,
} from 'lucide-react';
import { TelegramSimulator } from './components/TelegramSimulator.tsx';
import { CodeExplorer } from './components/CodeExplorer.tsx';
import { DatabaseSchemaView } from './components/DatabaseSchemaView.tsx';
import { AdminPanel } from './components/AdminPanel.tsx';
import { ArchitectureView } from './components/ArchitectureView.tsx';

export default function App() {
  const [activeTab, setActiveTab] = useState<'telegram' | 'code' | 'schema' | 'admin' | 'architecture'>('telegram');

  return (
    <div className="flex flex-col h-screen w-screen bg-[#090d14] text-slate-100 overflow-hidden font-sans">
      {/* Top Application Bar */}
      <nav className="h-14 bg-[#121824] border-b border-slate-800 px-4 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-black shadow-md shadow-cyan-500/20">
            S
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white tracking-wide text-sm">Sana AI</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                Production Bot Platform
              </span>
            </div>
            <p className="text-[10px] text-slate-400 hidden sm:block">
              Твой второй мозг для учёбы и работы • Google Gemini API + aiogram 3.x
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center bg-[#090d14] rounded-xl p-1 border border-slate-800 gap-1 text-xs font-medium overflow-x-auto no-scrollbar shrink-0 max-w-[65%] sm:max-w-none">
          <button
            onClick={() => setActiveTab('telegram')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shrink-0 ${
              activeTab === 'telegram'
                ? 'bg-cyan-600 text-white font-semibold shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Бот</span>
          </button>

          <button
            onClick={() => setActiveTab('code')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shrink-0 ${
              activeTab === 'code'
                ? 'bg-cyan-600 text-white font-semibold shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Код (ZIP)</span>
          </button>

          <button
            onClick={() => setActiveTab('schema')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shrink-0 ${
              activeTab === 'schema'
                ? 'bg-cyan-600 text-white font-semibold shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>БД</span>
          </button>

          <button
            onClick={() => setActiveTab('architecture')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shrink-0 ${
              activeTab === 'architecture'
                ? 'bg-cyan-600 text-white font-semibold shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Архитектура</span>
            <span className="sm:hidden">Стек</span>
          </button>

          <button
            onClick={() => setActiveTab('admin')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shrink-0 ${
              activeTab === 'admin'
                ? 'bg-cyan-600 text-white font-semibold shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Админ</span>
          </button>
        </div>
      </nav>

      {/* Main Content View */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'telegram' && (
          <TelegramSimulator onOpenAdmin={() => setActiveTab('admin')} />
        )}
        {activeTab === 'code' && <CodeExplorer />}
        {activeTab === 'schema' && <DatabaseSchemaView />}
        {activeTab === 'architecture' && <ArchitectureView />}
        {activeTab === 'admin' && <AdminPanel />}
      </main>
    </div>
  );
}
