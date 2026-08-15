# Развёртывание на Oracle Cloud

Инструкция для Compute-инстанса (подходит и Always Free `VM.Standard.A1.Flex`, ARM).
Все образы в `docker-compose.yml` есть для `arm64`, пересборка не нужна.

## 1. Инстанс и сеть

Создать VM (Ubuntu 22.04+, минимум 2 vCPU / 6 GB для ARM или 1 vCPU / 1 GB для x86 с swap).

В **Security List / Network Security Group** открыть ingress:

* `22/tcp` — SSH,
* `80/tcp` — HTTP,
* `443/tcp` — HTTPS.

Oracle дополнительно фильтрует трафик локальным iptables — это чаще всего причина
«порты открыты, а сайт не открывается»:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 2. Docker

```bash
sudo apt update && sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
```

## 3. Код и конфиг

```bash
git clone https://github.com/kacistka-del/naryad_MVP_v1.git
cd naryad_MVP_v1
cp .env.example .env
```

В `.env` рядом с `docker-compose.yml` задать:

```bash
POSTGRES_PASSWORD=<длинный пароль>
JWT_SECRET=<случайная строка, openssl rand -hex 32>
APP_BASE_URL=https://<ваш-домен>
PUBLIC_API_URL=https://<ваш-домен>
ADMIN_EMAIL=<ваш email>
ADMIN_PASSWORD=<пароль админа>
SMTP_URL=smtps://user:pass@smtp.провайдер:465
CRON_TOKEN=<случайная строка>
```

## 4. Запуск

```bash
docker compose up -d --build
docker compose exec api npm run migrate
docker compose exec api npm run seed
curl http://localhost/api/health
```

## 5. Домен и HTTPS

A-запись домена → public IP инстанса. Затем сертификат:

```bash
sudo apt install -y certbot
docker compose stop web
sudo certbot certonly --standalone -d <ваш-домен>
```

Дальше два варианта: пробросить `/etc/letsencrypt` в контейнер `web` и добавить
443-сервер в `nginx.conf`, либо поставить Caddy перед `web` — он выпишет сертификат сам.

## 6. Сервисные задачи

SLA-планировщик каждые 10 минут:

```bash
*/10 * * * * curl -s -X POST http://localhost/api/functions/runPlanner -H "X-Cron-Token: <CRON_TOKEN>" > /dev/null
```

Бэкап базы раз в сутки:

```bash
0 3 * * * cd ~/naryad_MVP_v1 && docker compose exec -T db pg_dump -U naryad naryad | gzip > ~/backups/naryad-$(date +\%F).sql.gz
```

Загруженные файлы лежат в docker-volume `uploads_data`. Если их станет много, разумно
переехать на Oracle Object Storage (S3-совместимый API) — меняется только
`server/src/routes/uploads.js`.

## 7. Обновление

```bash
git pull
docker compose up -d --build
docker compose exec api npm run migrate
```
