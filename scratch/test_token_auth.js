const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const anonKey = 'sb_publishable_Kl-7MDhLL15xzwrZoCwkGQ_xTgxmMIB';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

async function testBearerTokenAuth() {
  const supabaseService = createClient(url, serviceKey);
  const { data: approvedMembers, error: err } = await supabaseService
    .from('approved_members')
    .select('*');

  console.log('Service role fetch count:', approvedMembers ? approvedMembers.length : 0);
}

testBearerTokenAuth();
