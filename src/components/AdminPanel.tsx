import React, { useState } from 'react';
import {
  Users,
  TrendingUp,
  Sparkles,
  ShieldAlert,
  Send,
  CheckCircle,
  Search,
  UserCheck,
  Ban,
  Clock,
  DollarSign
} from 'lucide-react';

export const AdminPanel: React.FC = () => {
  const [users, setUsers] = useState([
    {
      id: 1048291,
      name: 'Димаш С.',
      username: '@dimash_s',
      goal: 'Сдать сессию и диплом',
      tz: 'Asia/Almaty',
      isPro: true,
      queries: 142,
      joined: '2026-10-18',
      status: 'active',
    },
    {
      id: 2094812,
      name: 'Айгерим К.',
      username: '@aigerim_dev',
      goal: 'Изучение Python и ML',
      tz: 'Asia/Almaty',
      isPro: false,
      queries: 18,
      joined: '2026-10-20',
      status: 'active',
    },
    {
      id: 3910481,
      name: 'Алексей Смирнов',
      username: '@alex_sm',
      goal: 'Работа и фриланс',
      tz: 'Europe/Moscow',
      isPro: true,
      queries: 340,
      joined: '2026-10-12',
      status: 'active',
    },
    {
      id: 4819203,
      name: 'Нурлан Б.',
      username: '@nurlan_b',
      goal: 'Подготовка к IELTS',
      tz: 'Asia/Tashkent',
      isPro: false,
      queries: 20,
      joined: '2026-10-21',
      status: 'active',
    },
    {
      id: 5910293,
      name: 'Тестовый Спамер',
      username: '@spam_bot',
      goal: 'Спам рассылка',
      tz: 'UTC',
      isPro: false,
      queries: 99,
      joined: '2026-10-22',
      status: 'banned',
    },
  ]);

  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastSent, setBroadcastSent] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [grantId, setGrantId] = useState('');
  const [grantDays, setGrantDays] = useState('30');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleGrantPro = (userId?: number) => {
    const targetId = userId || Number(grantId);
    if (!targetId) return;

    setUsers((prev) =>
      prev.map((u) => (u.id === targetId ? { ...u, isPro: true } : u))
    );
    showToast(`✅ Пользователю #${targetId} выдан Pro на ${grantDays} дней!`);
    setGrantId('');
  };

  const handleToggleBan = (userId: number) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === userId) {
          const newStatus = u.status === 'banned' ? 'active' : 'banned';
          showToast(`Пользователь #${userId} ${newStatus === 'banned' ? 'заблокирован' : 'разблокирован'}`);
          return { ...u, status: newStatus };
        }
        return u;
      })
    );
  };

  const handleSendBroadcast = () => {
    if (!broadcastText.trim()) return;
    setBroadcastSent(true);
    showToast(`📢 Рассылка успешно отправлена ${users.filter((u) => u.status === 'active').length} пользователям!`);
    setTimeout(() => {
      setBroadcastSent(false);
      setBroadcastText('');
    }, 2000);
  };

  const activeUsersCount = users.filter((u) => u.status === 'active').length;
  const proUsersCount = users.filter((u) => u.isPro).length;
  const conversionRate = ((proUsersCount / users.length) * 100).toFixed(1);

  return (
    <div className="h-full w-full overflow-y-auto p-6 bg-[#0d1117] text-slate-200">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-cyan-400" />
              Админ-панель Sana AI (/admin)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Статистика аудитории, управление тарифами, модерация и рассылки
            </p>
          </div>
          {toastMessage && (
            <div className="bg-emerald-950 border border-emerald-500 text-emerald-300 text-xs px-4 py-2 rounded-xl animate-fade-in font-medium">
              {toastMessage}
            </div>
          )}
        </div>

        {/* Analytics KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#161b22] border border-slate-800 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>DAU (за 24ч)</span>
              <Users className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold text-white">{activeUsersCount}</div>
            <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> +18.4% за неделю
            </div>
          </div>

          <div className="bg-[#161b22] border border-slate-800 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>Конверсия в Pro</span>
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-amber-300">{conversionRate}%</div>
            <div className="text-[11px] text-slate-400 mt-1">
              {proUsersCount} из {users.length} подписчиков
            </div>
          </div>

          <div className="bg-[#161b22] border border-slate-800 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>Выручка Telegram Stars</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              {proUsersCount * 100} ⭐
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              ≈ {proUsersCount * 990} ₸ / {proUsersCount * 1900} ₽
            </div>
          </div>

          <div className="bg-[#161b22] border border-slate-800 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>Ср. сессия диалога</span>
              <Clock className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-white">8.4 сообщ.</div>
            <div className="text-[11px] text-slate-400 mt-1">
              Высокая вовлечённость
            </div>
          </div>
        </div>

        {/* Quick Admin Actions: Manual Pro & Broadcast */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Grant Pro Box */}
          <div className="bg-[#161b22] border border-slate-800 p-4 rounded-2xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-cyan-400" />
              Выдача Pro вручную (/grant_pro)
            </h3>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Telegram ID пользователя"
                value={grantId}
                onChange={(e) => setGrantId(e.target.value)}
                className="flex-1 bg-[#0d1117] text-xs text-white px-3 py-2 rounded-xl border border-slate-700 focus:outline-hidden focus:border-cyan-500"
              />
              <select
                value={grantDays}
                onChange={(e) => setGrantDays(e.target.value)}
                className="bg-[#0d1117] text-xs text-white px-3 py-2 rounded-xl border border-slate-700"
              >
                <option value="7">7 дней</option>
                <option value="30">30 дней</option>
                <option value="90">90 дней</option>
                <option value="365">1 год</option>
              </select>
              <button
                onClick={() => handleGrantPro()}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold transition"
              >
                Выдать
              </button>
            </div>
          </div>

          {/* Broadcast Box */}
          <div className="bg-[#161b22] border border-slate-800 p-4 rounded-2xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <Send className="w-4 h-4 text-emerald-400" />
              Рассылка всем пользователям (/broadcast)
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Текст новости, обновления или скидки..."
                value={broadcastText}
                onChange={(e) => setBroadcastText(e.target.value)}
                className="flex-1 bg-[#0d1117] text-xs text-white px-3 py-2 rounded-xl border border-slate-700 focus:outline-hidden focus:border-emerald-500"
              />
              <button
                onClick={handleSendBroadcast}
                disabled={broadcastSent || !broadcastText.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
              >
                {broadcastSent ? <CheckCircle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                {broadcastSent ? 'Отправлено!' : 'Разослать'}
              </button>
            </div>
          </div>
        </div>

        {/* User Management Table */}
        <div className="bg-[#161b22] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Список пользователей</h3>
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Поиск по имени или никнейму..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#0d1117] text-xs text-white pl-8 pr-3 py-1.5 rounded-lg border border-slate-700"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#1f242c] text-slate-400 font-mono uppercase text-[11px] border-b border-slate-800">
                  <th className="py-2.5 px-4 font-semibold">Пользователь</th>
                  <th className="py-2.5 px-4 font-semibold">Цель</th>
                  <th className="py-2.5 px-4 font-semibold">Часовой пояс</th>
                  <th className="py-2.5 px-4 font-semibold">Тариф</th>
                  <th className="py-2.5 px-4 font-semibold">Запросов</th>
                  <th className="py-2.5 px-4 font-semibold">Статус</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {users
                  .filter(
                    (u) =>
                      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      u.username.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{u.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{u.username} • ID: {u.id}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-300">{u.goal}</td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{u.tz}</td>
                      <td className="py-3 px-4">
                        {u.isPro ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 flex items-center gap-1 w-fit">
                            <Sparkles className="w-3 h-3 fill-amber-300" /> Pro
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                            Free
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-200">{u.queries}</td>
                      <td className="py-3 px-4">
                        {u.status === 'banned' ? (
                          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-semibold">
                            Забанен
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold">
                            Активен
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        {!u.isPro && (
                          <button
                            onClick={() => handleGrantPro(u.id)}
                            className="px-2.5 py-1 rounded bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 text-[11px] transition"
                          >
                            +Pro
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleBan(u.id)}
                          className={`px-2.5 py-1 rounded text-[11px] transition ${
                            u.status === 'banned'
                              ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                              : 'bg-rose-950/40 text-rose-300 hover:bg-rose-900/60'
                          }`}
                        >
                          {u.status === 'banned' ? 'Разбан' : 'Бан'}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
