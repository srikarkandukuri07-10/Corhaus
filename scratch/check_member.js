const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function inspectEmail(email) {
  console.log(`=== CHECKING EMAIL: ${email} ===`);
  
  const { data: approved } = await supabase
    .from('approved_members')
    .select('*')
    .ilike('email', email);
  console.log('approved_members:', approved);

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .ilike('email', email);
  console.log('profiles:', profiles);

  const { data: staff } = await supabase
    .from('staff_members')
    .select('*')
    .ilike('email', email);
  console.log('staff_members:', staff);

  const { data: usersData } = await supabase.auth.admin.listUsers();
  const authUser = (usersData?.users || []).find(u => u.email?.toLowerCase() === email.toLowerCase());
  console.log('auth_user:', authUser ? { id: authUser.id, email: authUser.email, app_metadata: authUser.app_metadata, user_metadata: authUser.user_metadata } : 'NOT FOUND IN AUTH');
}

inspectEmail('kandukurisrujana1999@gmail.com');
