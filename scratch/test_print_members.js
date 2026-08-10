const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function printApprovedMembers() {
  const { data: mems } = await supabase.from('approved_members').select('*');
  console.log('APPROVED MEMBERS:');
  console.log(JSON.stringify(mems, null, 2));

  const { data: plans } = await supabase.from('member_purchased_plans').select('*');
  console.log('PURCHASED PLANS:');
  console.log(JSON.stringify(plans, null, 2));
}

printApprovedMembers();
