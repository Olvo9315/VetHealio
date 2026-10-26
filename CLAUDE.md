# VetHealio — CRM для ветеринарных клиник

## Stack
- Next.js 14 App Router + TypeScript
- Tailwind CSS + shadcn/ui
- Prisma ORM + PostgreSQL (Neon), миграции в prisma/migrations
- NextAuth.js v5
- next-intl (ES основной, RU, EN)

## Conventions
- Server components по умолчанию, 'use client' только когда нужна интерактивность
- Валидация через Zod везде
- Все тексты через next-intl t('key'), никаких хардкоженных строк
- Стиль: Material Design / Google, цвет #1D9E75

## Structure
- app/(auth)/ — страницы входа
- app/(dashboard)/ — защищённые страницы
- components/ui/ — shadcn компоненты
- components/ — кастомные компоненты
- lib/ — утилиты, prisma, auth

## Important
- Mobile-first всегда
- Не трогать файлы в components/ui/ — они генерируются shadcn
- Коммиты делать после каждого завершённого модуля

## Releases & clinics
- Каждая клиника — отдельный проект Vercel (clinics.json), прод + тест (Preview со STAGING_DATABASE_URL)
- Процесс выпуска и выкатки — RELEASES.md; выкатка только через `npm run clinic -- deploy`
- Изменения схемы БД — только через `npm run db:migrate -- --name ...`, не `db push`
- Тексты UI — только через next-intl во всех трёх языках (messages/es|ru|en.json)
