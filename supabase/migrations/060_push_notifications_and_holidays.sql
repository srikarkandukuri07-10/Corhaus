-- Migration 060: Push Notifications & Studio Holidays

-- 1. Push Subscriptions Table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NULL,
    role TEXT NOT NULL DEFAULT 'member', -- 'admin', 'staff', 'member'
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_sub_role ON public.push_subscriptions(role);
CREATE INDEX IF NOT EXISTS idx_push_sub_user_id ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'Allow public insert/update of push subscriptions'
    ) THEN
        CREATE POLICY "Allow public insert/update of push subscriptions"
        ON public.push_subscriptions FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

-- 2. Studio Holidays Table
CREATE TABLE IF NOT EXISTS public.studio_holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    notify_members BOOLEAN NOT NULL DEFAULT true,
    created_by TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_studio_holidays_dates ON public.studio_holidays(start_date, end_date);

ALTER TABLE public.studio_holidays ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'studio_holidays' AND policyname = 'Allow select studio_holidays for everyone'
    ) THEN
        CREATE POLICY "Allow select studio_holidays for everyone"
        ON public.studio_holidays FOR SELECT
        USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'studio_holidays' AND policyname = 'Allow manage studio_holidays'
    ) THEN
        CREATE POLICY "Allow manage studio_holidays"
        ON public.studio_holidays FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;
