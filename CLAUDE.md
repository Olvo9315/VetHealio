# VetHealio — CRM для ветеринарных клиник

## Stack
- Next.js 14 App Router + TypeScript
- Tailwind CSS + shadcn/ui
- Prisma ORM + PostgreSQL (Supabase)
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