-- Migration 035: Expenses Module Tables, Predefined Categories & RLS

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  category_name TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL,
  paid_to TEXT,
  expense_date DATE NOT NULL,
  description TEXT,
  is_recurring BOOLEAN DEFAULT false,
  recurring_frequency TEXT CHECK (recurring_frequency IN ('Daily', 'Weekly', 'Monthly')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Predefined Expense Categories
INSERT INTO public.expense_categories (category_name)
VALUES 
  ('Rent'),
  ('Salaries'),
  ('Utilities'),
  ('Equipment'),
  ('Marketing'),
  ('Software'),
  ('Maintenance'),
  ('Miscellaneous')
ON CONFLICT (category_name) DO NOTHING;

-- Create Indexes for fast filtering & analytics
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses (expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses (category_name);
CREATE INDEX IF NOT EXISTS idx_expenses_recurring ON public.expenses (is_recurring);

-- Enable RLS
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Policies for Admin users
DROP POLICY IF EXISTS "Admin can manage expense categories" ON public.expense_categories;
CREATE POLICY "Admin can manage expense categories" ON public.expense_categories FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin can manage expenses" ON public.expenses;
CREATE POLICY "Admin can manage expenses" ON public.expenses FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Add to Realtime publication if available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
