import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool, query } from './db.js';
import { store } from './store.js';

const DEFAULT_CATEGORIES = [
  { code: 'REPAIR', name: 'Ремонт и отделка', isArchived: false },
  { code: 'CLEANING', name: 'Уборка', isArchived: false },
  { code: 'MOVING', name: 'Грузоперевозки и переезды', isArchived: false },
  { code: 'ELECTRIC', name: 'Электрика', isArchived: false },
  { code: 'PLUMBING', name: 'Сантехника', isArchived: false },
  { code: 'DIGITAL', name: 'Цифровые услуги', isArchived: false },
];

const DEFAULT_SETTINGS = [
  { key: 'commissionRate', valueNumber: 10 },
  { key: 'timeoutNewHours', valueNumber: 4 },
  { key: 'timeoutAssignedHours', valueNumber: 24 },
  { key: 'timeoutAwaitingConfirmHours', valueNumber: 72 },
  { key: 'searchRetryMinutes', valueNumber: 30 },
  { key: 'autonomyLevel', value: 'L1' },
];

try {
  const email = (process.env.ADMIN_EMAIL || 'admin@naryad.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'change_me';
  const hash = await bcrypt.hash(password, 10);

  await query(
    `insert into users (email, password_hash, role, is_verified, data)
     values ($1, $2, 'admin', true, '{"full_name":"Администратор"}'::jsonb)
     on conflict (email) do update set role = 'admin', is_verified = true, updated_date = now()`,
    [email, hash]
  );
  console.log(`[seed] администратор: ${email}`);

  for (const category of DEFAULT_CATEGORIES) {
    const existing = await store.filter('Category', { code: category.code });
    if (!existing.length) await store.create('Category', category);
  }
  console.log('[seed] категории готовы');

  for (const setting of DEFAULT_SETTINGS) {
    const existing = await store.filter('SystemSetting', { key: setting.key });
    if (!existing.length) await store.create('SystemSetting', setting);
  }
  console.log('[seed] системные настройки готовы');
} catch (e) {
  console.error('[seed] ошибка:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
