# 100k_rycos — High-Performance Ordering & RYCOS Fiscalization Engine

Niezależny, nowoczesny system zamawiania dla gastronomii, obsługi eventów masowych (100k+ zamówień) oraz integracji ze stacjami fiskalnymi **RYCOS**.

Zaprojektowany do uruchomienia na serwerze VPS zarządzanym przez **Coolify** z wykorzystaniem **Supabase** (PostgreSQL, Auth, Storage) oraz pamięci podręcznej **Redis** dla kolejek zadań BullMQ.

---

## 🏗️ Architektura Systemu

```
                                [ Klient z kodem QR ]
                                          │
                                          ▼
                             [ apps/customer-web (PWA) ]
                             • Next.js 15 App Router (< 120 KB JS)
                             • Błyskawiczne ładowanie menu (< 400 ms)
                             • Płatności BLIK, Apple/Google Pay, Karty
                             • Live tracking zamówienia (PIN + WebSockets)
                                          │
                                          ▼ (HTTP / WebSocket)
                             [ apps/api (Fastify 5 + TS) ]
                             • Ścisła walidacja schematów Zod
                             • Idempotency Keys (brak duplikatów zamówień)
                             • Atomowy zapis transakcyjny ACID w PostgreSQL
                             • Wzorzec Transactional Outbox
                             • WebSockets z klastrowaniem przez Redis Pub/Sub
                                          │
                     ┌────────────────────┴────────────────────┐
                     ▼                                         ▼
         [ PostgreSQL (Supabase) ]                     [ apps/worker (BullMQ) ]
         • Source of Truth                             • Asynchroniczna fiskalizacja RYCOS MQTT
         • Brak utraty danych                          • Automatyczny retry & circuit breaker
         • Pełna integralność                          • Powiadomienia w czasie rzeczywistym
```

---

## 📁 Struktura Monorepo (`pnpm workspaces`)

```
100k_rycos/
├── apps/
│   ├── api/                 # Główny silnik API (Fastify 5, OpenAPI /docs, WebSockets)
│   ├── worker/              # Worker w tle (BullMQ, RYCOS MQTT, Outbox Dispatcher)
│   └── customer-web/        # Ultra-lekki PWA dla klientów QR (Next.js 15, Tailwind CSS)
│
├── packages/
│   ├── shared/              # Wspólne schematy Zod, typy TypeScript, kontrakty API
│   └── database/            # Drizzle ORM, modele tabel, migracje i seed danych
│
├── docker-compose.coolify.yml # Konfiguracja wdrożeniowa pod Coolify
├── .env.example             # Wzór zmiennych środowiskowych
└── pnpm-workspace.yaml      # Definicja repozytorium wielomodułowego
```

---

## 🚀 Jak Uruchomić Lokalnie (Development)

### 1. Wymagania:
- Node.js 20+ lub 22+
- `pnpm` (wersja 10+)
- Działający PostgreSQL (lub lokalny Supabase) oraz Redis

### 2. Konfiguracja zmiennych środowiskowych:
```bash
cp .env.example .env
# Uzupełnij DATABASE_URL oraz REDIS_URL w pliku .env
```

### 3. Instalacja zależności:
```bash
pnpm install
```

### 4. Inicjalizacja bazy danych i seedowanie danych testowych:
```bash
cd packages/database
pnpm db:push       # Utworzenie tabel w PostgreSQL
pnpm tsx src/seed.ts  # Wgranie przykładowych burgerów, pizzy, dodatków i drukarki fiskalnej
cd ../..
```

### 5. Uruchomienie wszystkich usług:
```bash
pnpm dev
```
- **Core API & Swagger Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Customer Web (PWA):** [http://localhost:3000?brand=yalla-burger&table=12](http://localhost:3000?brand=yalla-burger&table=12)
- **Worker:** Działa w tle, nasłuchując na kolejki BullMQ i tabelę `outbox_events`.

---

## 🚢 Wdrożenie na VPS z Coolify i Supabase

1. **W Coolify utwórz nowy projekt** (np. `100k-rycos`).
2. **Dodaj zasób Git** wskazujący na Twoje repozytorium z katalogiem `100k_rycos`.
3. Wybierz opcję **Docker Compose** i wskaż plik `docker-compose.coolify.yml` (lub dodaj usługi osobno z dedykowanych `Dockerfile`):
   - `api`: port `8000` (np. domena `api.twojadomena.pl`)
   - `customer-web`: port `3000` (np. domena `order.twojadomena.pl`)
   - `worker`: usługa w tle (brak publicznego portu)
4. **Zmienne środowiskowe w Coolify:**
   - `DATABASE_URL`: Wewnętrzny URL do Twojej bazy Supabase na VPS (np. `postgresql://postgres:haslo@supabase-db:5432/postgres`)
   - `REDIS_URL`: Wewnętrzny adres usługi Redis w Coolify (np. `redis://redis:6379`)
   - `RYCOS_MQTT_HOST`, `RYCOS_MQTT_USERNAME`, `RYCOS_MQTT_PASSWORD`
   - `NEXT_PUBLIC_API_URL`: Adres publiczny API (np. `https://api.twojadomena.pl`)
   - `NEXT_PUBLIC_WS_URL`: Adres WebSocketów API (np. `wss://api.twojadomena.pl/v1/ws`)
5. Kliknij **Deploy** – Coolify automatycznie zbuduje kontenery, skonfiguruje certyfikaty SSL Let's Encrypt i uruchomi healthchecki!

---

## ⚡ Dlaczego ten system jest szybszy i bezpieczniejszy?

1. **Brak blokad Redisa:** Poprzedni kod wykonywał co 5s blokujące polecenie `redis.keys()`. Tutaj Redis używany jest wyłącznie do pub/sub i kolejek BullMQ – zero blokowania pętli zdarzeń.
2. **Zero utraty danych:** Każde zamówienie od razu trafia do bazy w atomowej transakcji PostgreSQL (ACID) z obsługą idempotencji (brak podwójnego płacenia).
3. **PWA zamiast Flutter Web:** Klient nie pobiera już 10 MB silnika Wasm/Canvas. Strona waży < 120 KB, otwiera się w ułamku sekundy na każdym smartfonie.
4. **Odporna fiskalizacja RYCOS:** Cała komunikacja z urządzeniami fiskalnymi i protokołem MQTT odbywa się w tle z automatycznym wznawianiem. Awaria sieci czy opóźnienie drukarki nigdy nie spowalnia odpowiedzi dla klienta przy stoliku.
# 100k_rycos
