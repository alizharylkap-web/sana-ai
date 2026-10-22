import React from 'react';
import { Database, Key, Hash, Link2, Sparkles, Layers } from 'lucide-react';

export const DatabaseSchemaView: React.FC = () => {
  const tables = [
    {
      name: 'users',
      description: 'Основная таблица профилей пользователей, тарифов, часовых поясов и рефералов',
      indexes: [
        'PRIMARY KEY (telegram_id)',
        'idx_users_is_pro ON users(is_pro)',
        'idx_users_ref_code ON users(referral_code)',
        'idx_user_pro_reset ON users(is_pro, last_reset_date)'
      ],
      columns: [
        { name: 'telegram_id', type: 'BIGINT', pk: true, nullable: false, desc: 'Уникальный ID пользователя Telegram' },
        { name: 'username', type: 'VARCHAR(64)', nullable: true, desc: 'Никнейм @username в Telegram' },
        { name: 'first_name', type: 'VARCHAR(128)', nullable: false, desc: 'Имя пользователя' },
        { name: 'last_name', type: 'VARCHAR(128)', nullable: true, desc: 'Фамилия' },
        { name: 'language', type: 'VARCHAR(5)', nullable: false, default: "'ru'", desc: 'Язык интерфейса: ru | kk | en' },
        { name: 'mode', type: 'VARCHAR(32)', nullable: false, default: "'mentor'", desc: 'Текущий режим бота' },
        { name: 'timezone', type: 'VARCHAR(64)', nullable: false, default: "'Asia/Almaty'", desc: 'Часовой пояс для сброса и напоминаний' },
        { name: 'study_goal', type: 'VARCHAR(255)', nullable: true, desc: 'Цель обучения (онбординг)' },
        { name: 'onboarding_completed', type: 'BOOLEAN', nullable: false, default: 'false', desc: 'Флаг прохождения онбординга' },
        { name: 'is_pro', type: 'BOOLEAN', nullable: false, default: 'false', desc: 'Статус подписки Sana Pro' },
        { name: 'pro_expires_at', type: 'TIMESTAMPTZ', nullable: true, desc: 'Срок окончания Pro подписки' },
        { name: 'queries_used_today', type: 'INTEGER', nullable: false, default: '0', desc: 'Количество потраченных запросов сегодня' },
        { name: 'bonus_queries', type: 'INTEGER', nullable: false, default: '0', desc: 'Бонусные запросы (реферальные)' },
        { name: 'last_reset_date', type: 'DATE', nullable: false, desc: 'Дата последнего сброса суточного лимита' },
        { name: 'referral_code', type: 'VARCHAR(32)', nullable: false, unique: true, desc: 'Уникальный код приглашения' },
        { name: 'referred_by_id', type: 'BIGINT', nullable: true, fk: 'users.telegram_id', desc: 'Кто пригласил данного пользователя' },
        { name: 'referral_count', type: 'INTEGER', nullable: false, default: '0', desc: 'Количество приглашенных друзей' },
        { name: 'is_banned', type: 'BOOLEAN', nullable: false, default: 'false', desc: 'Флаг блокировки' },
        { name: 'is_admin', type: 'BOOLEAN', nullable: false, default: 'false', desc: 'Флаг администратора' },
        { name: 'created_at', type: 'TIMESTAMPTZ', nullable: false, default: 'NOW()', desc: 'Дата регистрации' },
        { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: false, default: 'NOW()', desc: 'Дата обновления' },
      ],
    },
    {
      name: 'dialog_messages',
      description: 'Краткосрочный контекст диалогов (последние 12 сообщений)',
      indexes: [
        'PRIMARY KEY (id)',
        'idx_dialog_user_created ON dialog_messages(user_id, created_at DESC)'
      ],
      columns: [
        { name: 'id', type: 'BIGINT', pk: true, nullable: false, desc: 'Автоинкрементный ID' },
        { name: 'user_id', type: 'BIGINT', nullable: false, fk: 'users.telegram_id (ON DELETE CASCADE)', desc: 'ID владельца сообщения' },
        { name: 'role', type: 'VARCHAR(16)', nullable: false, desc: 'user | model | system' },
        { name: 'content', type: 'TEXT', nullable: false, desc: 'Текст сообщения или промпта' },
        { name: 'mode', type: 'VARCHAR(32)', nullable: false, desc: 'Режим бота во время отправки' },
        { name: 'token_count', type: 'INTEGER', nullable: false, default: '0', desc: 'Примерный подсчет токенов' },
        { name: 'created_at', type: 'TIMESTAMPTZ', nullable: false, default: 'NOW()', desc: 'Время создания' },
      ],
    },
    {
      name: 'long_term_memories',
      description: 'Долгосрочная память: факты о пользователе (вуз, курс, проекты, стек)',
      indexes: [
        'PRIMARY KEY (id)',
        'idx_memories_user_active ON long_term_memories(user_id, is_active)'
      ],
      columns: [
        { name: 'id', type: 'BIGINT', pk: true, nullable: false, desc: 'ID факта' },
        { name: 'user_id', type: 'BIGINT', nullable: false, fk: 'users.telegram_id (ON DELETE CASCADE)', desc: 'ID пользователя' },
        { name: 'fact', type: 'VARCHAR(512)', nullable: false, desc: 'Текст факта ("Учится на 3 курсе IT")' },
        { name: 'category', type: 'VARCHAR(64)', nullable: false, default: "'general'", desc: 'Категория (study, tech, personal)' },
        { name: 'is_active', type: 'BOOLEAN', nullable: false, default: 'true', desc: 'Актуален ли факт' },
        { name: 'created_at', type: 'TIMESTAMPTZ', nullable: false, default: 'NOW()', desc: 'Дата обнаружения' },
      ],
    },
    {
      name: 'reminders',
      description: 'Напоминания с учетом часового пояса и фоновым планировщиком',
      indexes: [
        'PRIMARY KEY (id)',
        'idx_active_reminders_due ON reminders(is_completed, remind_at_utc)'
      ],
      columns: [
        { name: 'id', type: 'BIGINT', pk: true, nullable: false, desc: 'ID напоминания' },
        { name: 'user_id', type: 'BIGINT', nullable: false, fk: 'users.telegram_id (ON DELETE CASCADE)', desc: 'ID пользователя' },
        { name: 'title', type: 'VARCHAR(512)', nullable: false, desc: 'Текст задачи' },
        { name: 'remind_at_utc', type: 'TIMESTAMPTZ', nullable: false, desc: 'Точное время напоминания в UTC' },
        { name: 'is_completed', type: 'BOOLEAN', nullable: false, default: 'false', desc: 'Статус отправки' },
        { name: 'created_at', type: 'TIMESTAMPTZ', nullable: false, default: 'NOW()', desc: 'Время создания' },
      ],
    },
    {
      name: 'transactions',
      description: 'История платежей через Telegram Stars за подписку Sana Pro',
      indexes: [
        'PRIMARY KEY (id)',
        'UNIQUE idx_tx_telegram_charge ON transactions(telegram_payment_charge_id)',
        'idx_tx_user ON transactions(user_id)'
      ],
      columns: [
        { name: 'id', type: 'BIGINT', pk: true, nullable: false, desc: 'ID транзакции' },
        { name: 'user_id', type: 'BIGINT', nullable: false, fk: 'users.telegram_id (ON DELETE CASCADE)', desc: 'ID плательщика' },
        { name: 'telegram_payment_charge_id', type: 'VARCHAR(128)', nullable: false, unique: true, desc: 'Уникальный ID транзакции Telegram Stars' },
        { name: 'provider_payment_charge_id', type: 'VARCHAR(128)', nullable: true, desc: 'ID провайдера платежа' },
        { name: 'amount_stars', type: 'INTEGER', nullable: false, desc: 'Количество звезд (100 XTR)' },
        { name: 'status', type: 'VARCHAR(32)', nullable: false, default: "'successful'", desc: 'pending | successful | refunded' },
        { name: 'duration_days', type: 'INTEGER', nullable: false, default: '30', desc: 'Количество дней подписки' },
        { name: 'created_at', type: 'TIMESTAMPTZ', nullable: false, default: 'NOW()', desc: 'Дата оплаты' },
      ],
    },
  ];

  return (
    <div className="h-full w-full overflow-y-auto p-6 bg-[#0d1117] text-slate-200">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Реляционная схема PostgreSQL 16 (SQLAlchemy 2.0)</h2>
              <p className="text-sm text-slate-400">
                Спроектирована под высокую нагрузку, партиционирование диалогов и быстрые выборки по индексам
              </p>
            </div>
          </div>
        </div>

        {/* Tables Grid */}
        <div className="space-y-6">
          {tables.map((table) => (
            <div
              key={table.name}
              className="bg-[#161b22] border border-slate-800 rounded-2xl overflow-hidden shadow-lg"
            >
              {/* Table Header */}
              <div className="px-6 py-4 bg-[#1f242c] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-base text-cyan-300">
                    table {table.name}
                  </span>
                  <span className="text-xs text-slate-400 hidden sm:inline">
                    — {table.description}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md font-mono">
                    {table.columns.length} колонок
                  </span>
                </div>
              </div>

              {/* Columns Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#161b22] border-b border-slate-800 text-slate-400 font-mono uppercase text-[11px]">
                      <th className="py-2.5 px-4 font-semibold">Поле</th>
                      <th className="py-2.5 px-4 font-semibold">Тип</th>
                      <th className="py-2.5 px-4 font-semibold">Ключ / Ограничение</th>
                      <th className="py-2.5 px-4 font-semibold">Default</th>
                      <th className="py-2.5 px-4 font-semibold">Описание</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {table.columns.map((col) => (
                      <tr key={col.name} className="hover:bg-slate-800/30 transition">
                        <td className="py-2.5 px-4 font-mono font-medium text-white flex items-center gap-1.5">
                          {col.pk && <Key className="w-3.5 h-3.5 text-amber-400" />}
                          {col.fk && <Link2 className="w-3.5 h-3.5 text-blue-400" />}
                          <span>{col.name}</span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-cyan-400">{col.type}</td>
                        <td className="py-2.5 px-4 font-mono">
                          {col.pk && <span className="text-amber-400 font-bold">PRIMARY KEY</span>}
                          {col.fk && <span className="text-blue-400 font-medium">FK → {col.fk}</span>}
                          {col.unique && <span className="text-emerald-400 font-medium">UNIQUE</span>}
                          {!col.pk && !col.fk && !col.unique && (
                            <span className="text-slate-500">{col.nullable ? 'NULL' : 'NOT NULL'}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-400">
                          {col.default || '—'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-300">{col.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Indexes footer */}
              {table.indexes && table.indexes.length > 0 && (
                <div className="px-6 py-3 bg-[#11161d] border-t border-slate-800 text-[11px] font-mono text-slate-400 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-300">Индексы:</span>
                  {table.indexes.map((idx, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-slate-800/80 text-cyan-300 border border-slate-700">
                      {idx}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
