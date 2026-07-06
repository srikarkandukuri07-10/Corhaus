-- CORHAUS PILATES PLATFORM - Predefined Class Types & Membership Tiers
-- ============================================================

-- 1. Create class_types table
CREATE TABLE IF NOT EXISTS public.class_types (
  name TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

-- Enable RLS
ALTER TABLE public.class_types ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone authenticated can view class_types" ON public.class_types;
DROP POLICY IF EXISTS "Admins can manage class_types" ON public.class_types;

-- Policies for class_types
CREATE POLICY "Anyone authenticated can view class_types" ON public.class_types
  FOR SELECT TO authenticated USING (true);
  
CREATE POLICY "Admins can manage class_types" ON public.class_types
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  
-- Seed class_types
INSERT INTO public.class_types (name, description) VALUES
('Reformer Pilates', 'Machine-based Pilates that improves strength, posture, flexibility and core stability.'),
('Mat Pilates', 'Floor-based Pilates focusing on controlled movements, balance and flexibility.'),
('Beginner Pilates', 'Designed for first-time members learning the fundamentals of Pilates.'),
('Intermediate Pilates', 'Builds on fundamentals with faster tempos and more challenging movement progressions.'),
('Advanced Pilates', 'High-intensity athletic movements targeting elite core strength, coordination, and precision.'),
('Tower Pilates', 'Utilizes tower apparatus springs and bars to sculpt, stretch, and strengthen the entire body.'),
('Cadillac Pilates', 'An advanced spring-based system for deep stretching, core conditioning, and rehabilitation.'),
('Chair Pilates', 'Focuses on balance, vertical posture, and lower-body strength using the Pilates Chair.'),
('Barrel Pilates', 'Designed to support, stretch, and challenge the spine, improving flexibility and posture.'),
('Prenatal Pilates', 'Safe, low-impact exercise tailored to support expectant mothers throughout pregnancy.'),
('Postnatal Pilates', 'Helps new mothers safely rebuild core connection, pelvic floor strength, and posture.'),
('Senior Pilates', 'Gentle movement focusing on joint mobility, balance, stability, and fall prevention.'),
('Therapeutic / Rehab Pilates', 'Specialized, restorative movements to aid recovery from injuries and chronic pain.'),
('Private Session', 'One-on-one personalized instruction customized to your unique body goals and needs.'),
('Duet Session', 'Semi-private session for two people, focusing on shared progress and customized coaching.'),
('Small Group Reformer', 'Intimate reformer class providing individualized attention in a small group setting.'),
('Stretch & Mobility', 'Dedicated to releasing muscle tension, improving joint range of motion, and relaxation.'),
('Core & Strength Pilates', 'Focuses specifically on deep abdominal work and full-body resistance training.'),
('Pilates + Cardio', 'Fuses classical Pilates control with high-energy cardiovascular intervals for fat-burn.'),
('Pilates Fusion', 'A dynamic blend of Pilates, yoga, and barre elements for a diverse and fun workout.'),
('Athletic Pilates', 'A fast-paced, athletic reformer workout to build stamina, power, and muscle tone.')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- 2. Create membership_credit_tiers table
CREATE TABLE IF NOT EXISTS public.membership_credit_tiers (
  level TEXT PRIMARY KEY CHECK (level IN ('Beginner', 'Intermediate', 'Advanced')),
  credits INTEGER NOT NULL
);

-- Enable RLS
ALTER TABLE public.membership_credit_tiers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone authenticated can view membership_credit_tiers" ON public.membership_credit_tiers;
DROP POLICY IF EXISTS "Admins can manage membership_credit_tiers" ON public.membership_credit_tiers;

-- Policies for membership_credit_tiers
CREATE POLICY "Anyone authenticated can view membership_credit_tiers" ON public.membership_credit_tiers
  FOR SELECT TO authenticated USING (true);
  
CREATE POLICY "Admins can manage membership_credit_tiers" ON public.membership_credit_tiers
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  
-- Seed membership_credit_tiers
INSERT INTO public.membership_credit_tiers (level, credits) VALUES
('Beginner', 6),
('Intermediate', 10),
('Advanced', 14)
ON CONFLICT (level) DO UPDATE SET credits = EXCLUDED.credits;

-- 3. Add membership_level column to approved_members
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'approved_members' 
      AND column_name = 'membership_level'
  ) THEN
    ALTER TABLE public.approved_members 
    ADD COLUMN membership_level TEXT DEFAULT 'Beginner' CHECK (membership_level IN ('Beginner', 'Intermediate', 'Advanced'));
  END IF;
END $$;

-- 4. Enable Realtime for the new tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'class_types'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.class_types;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'membership_credit_tiers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.membership_credit_tiers;
  END IF;
END $$;
