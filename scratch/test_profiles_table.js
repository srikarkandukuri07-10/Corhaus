const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function testProfilesTable() {
  console.log('Testing direct insert into profiles table...');
  const fakeId = '00000000-0000-0000-0000-000000000099';

  // Test 1: Insert minimal profile
  const { data: d1, error: e1 } = await supabase.from('profiles').insert({
    id: fakeId,
    email: 'test_fake_99@gmail.com',
    role: 'member',
  });
  console.log('Insert minimal profile result error:', e1);

  // Clean up
  await supabase.from('profiles').delete().eq('id', fakeId);
}

testProfilesTable();
