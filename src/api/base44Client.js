import { db } from '@/lib/self-hosted-db';

// Исторические импорты: раньше здесь создавался клиент Base44.
// Теперь это тот же самохостимый клиент, что и в globalThis.__B44_DB__.
export { db };
export const base44 = db;
export default db;
