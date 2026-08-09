const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function testFullInsert() {
  const fakeId = '00000000-0000-0000-0000-000000000077';

  console.log('Testing insert with full_name AND phone_number (empty string vs N/A)...');

  const { error: e1 } = await supabase.from('profiles').insert({
    id: fakeId,
    email: 'test_fake_77@gmail.com',
    full_name: 'Test Member',
    phone_number: 'N/A',
    role: 'member',
  });
  console.log('Insert with phone_number="N/A" error:', e1);

  if (!e1) {
    console.log('SUCCESS inserting into profiles table!');
    await supabase.from('profiles').delete().eq('id', fakeId);
  }
}

testFullInsert();
