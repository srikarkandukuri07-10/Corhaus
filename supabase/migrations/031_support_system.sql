-- ============================================================
-- 031: Support Center (Real-Time Chat & Ticket System)
-- ============================================================

-- 1. Create support_tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL, -- Bug Report, Feature Request, UI Improvement, Performance, Billing, Automation, Other
  priority TEXT NOT NULL DEFAULT 'Medium', -- Low, Medium, High, Critical
  status TEXT NOT NULL DEFAULT 'Open', -- Open, In Progress, Waiting for Corhaus, Resolved, Closed
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create support_messages table
CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL, -- 'client', 'developer'
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  attachment_url TEXT,
  attachment_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- 3. Ticket Number Sequence and Trigger Function
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq START WITH 1001;

CREATE OR REPLACE FUNCTION public.set_support_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := 'TCK-' || nextval('public.support_ticket_number_seq')::text;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_support_ticket_number ON public.support_tickets;
CREATE TRIGGER trg_set_support_ticket_number
BEFORE INSERT ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.set_support_ticket_number();

-- 4. Drop and update profiles_role_check constraint to allow 'developer'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'member', 'trainer', 'staff', 'developer'));

-- Set Developer Account Role
UPDATE public.profiles
SET role = 'developer'
WHERE email = 'kandukurisrikar10@gmail.com';

-- Update handle_new_user trigger to recognize developer role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    CASE
      WHEN NEW.email = 'kandukurisrikar10@gmail.com' THEN 'developer'
      WHEN NEW.email = 'admin@corhaus.com' THEN 'admin'
      ELSE 'member'
    END,
    'active'
  )
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

-- 5. Enable RLS and Policies for support_tickets and support_messages
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view relevant tickets" ON public.support_tickets;
CREATE POLICY "Users can view relevant tickets" ON public.support_tickets
FOR ALL TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'developer' OR role = 'admin'))
  OR (SELECT email FROM public.profiles WHERE id = auth.uid()) = 'kandukurisrikar10@gmail.com'
)
WITH CHECK (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'developer' OR role = 'admin'))
  OR (SELECT email FROM public.profiles WHERE id = auth.uid()) = 'kandukurisrikar10@gmail.com'
);

DROP POLICY IF EXISTS "Users can view relevant messages" ON public.support_messages;
CREATE POLICY "Users can view relevant messages" ON public.support_messages
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.support_tickets st
    WHERE st.id = support_messages.ticket_id
    AND (
      st.created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'developer' OR role = 'admin'))
      OR (SELECT email FROM public.profiles WHERE id = auth.uid()) = 'kandukurisrikar10@gmail.com'
    )
  )
)
WITH CHECK (
  sender_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'developer' OR role = 'admin'))
);

-- 6. Add Realtime Subscriptions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 7. Create Support Attachments Storage Bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('support_attachments', 'support_attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Support attachments select policy" ON storage.objects;
CREATE POLICY "Support attachments select policy" ON storage.objects
FOR SELECT TO authenticated USING (bucket_id = 'support_attachments');

DROP POLICY IF EXISTS "Support attachments insert policy" ON storage.objects;
CREATE POLICY "Support attachments insert policy" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'support_attachments');
