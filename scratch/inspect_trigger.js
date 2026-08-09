const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function inspectTriggers() {
  // Let's try running a direct query or checking rpc functions
  console.log('Inspecting Supabase Auth & Triggers...');
  
  // Try generating a magiclink or link to see if admin.generateLink works
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'kandukurisrujana1999@gmail.com'
  });

  console.log('generateLink result:', linkData ? { user_id: linkData.user?.id } : null, 'error:', linkErr);
}

inspectTriggers();
