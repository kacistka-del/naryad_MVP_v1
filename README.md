# НАРЯД — MVP

Координируемый маркетплейс бытовых и деловых услуг. Проект полностью самохостимый:
никаких внешних платформ для авторизации, базы или серверных функций не требуется.

## Стек

| Слой | Технология |
|---|---|
| Фронтенд | React 18 + Vite + Tailwind + shadcn/ui |
| Backend | Node.js 20 + Express |
| База | PostgreSQL 16 |
| Авторизация | JWT (email + пароль, OTP-подтверждение, Google OAuth опционально) |
| Файлы | диск сервера (`/uploads`) |
| Запуск | Docker Compose + nginx |

## Быстрый старт локально

### 1. База данных

```bash
docker run -d --name naryad-db -p 5432:5432 \
  -e POSTGRES_USER=naryad -e POSTGRES_PASSWORD=naryad -e POSTGRES_DB=naryad \
  postgres:16-alpine
```

### 2. Backend

```bash
cd server
cp .env.example .env      # пропишите JWT_SECRET и DATABASE_URL
npm install
npm run migrate           # создаёт таблицы
npm run seed              # админ, категории, настройки
npm run dev               # http://localhost:8080
```

### 3. Фронтенд

```bash
cp .env.example .env.local
npm install
npm run dev               # http://localhost:5173
```

Vite проксирует `/api` и `/uploads` на `localhost:8080`, поэтому CORS настраивать не нужно.

Без SMTP коды подтверждения и ссылки сброса пароля печатаются в лог backend и возвращаются
в ответе (`devOtp`, `devToken`) — удобно для разработки.

## Запуск всего стека одной командой

```bash
cp .env.example .env      # добавьте JWT_SECRET, POSTGRES_PASSWORD, ADMIN_*
docker compose up -d --build
docker compose exec api npm run migrate
docker compose exec api npm run seed
```

Приложение — на `http://<адрес-сервера>/`, API — на `/api`.

Развёртывание на Oracle Cloud описано в [DEPLOY_ORACLE.md](./DEPLOY_ORACLE.md).

## Архитектура

```
src/                    фронтенд (React)
  lib/self-hosted-db.js клиент данных: auth / entities / functions / uploads
  lib/install-db.js     регистрирует клиент глобально (импортируется первым в main.jsx)
  pages/                страницы и сценарии
server/                 backend (Express + PostgreSQL)
  src/routes/auth.js    регистрация, вход, OTP, сброс пароля, Google OAuth
  src/routes/entities.js CRUD по сущностям с проверкой прав
  src/routes/functions.js бизнес-логика нарядов
  src/store.js          доступ к данным
  src/schema.sql        схема базы
```

## Серверные функции

| Маршрут | Назначение |
|---|---|
| `POST /api/functions/transitionOrderStatus` | перевод статуса наряда с проверкой роли, историей, уведомлениями, расчётом комиссии |
| `POST /api/functions/submitOrderReview` | отзыв клиента и пересчёт рейтинга исполнителя |
| `POST /api/functions/runPlanner` | SLA-контроль и автономные действия (админ или cron с `X-Cron-Token`) |
| `POST /api/functions/structureOrder` | подсказка структуры наряда по описанию |

`structureOrder` работает без LLM — в этом случае возвращает эвристическую оценку.
С `OPENAI_API_KEY` подключается модель.

SLA-планировщик удобно вешать на cron:

```bash
*/10 * * * * curl -s -X POST http://localhost/api/functions/runPlanner -H "X-Cron-Token: $CRON_TOKEN"
```

## Миграция с Base44

Проект больше не зависит от Base44. Подробности — в [MIGRATION.md](./MIGRATION.md).
