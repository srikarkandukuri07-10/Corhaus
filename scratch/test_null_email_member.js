const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function testNullEmailMember() {
  const { data: approvedData } = await supabase.from('approved_members').select('*');
  console.log('Approved members total:', approvedData ? approvedData.length : 0);

  const nullEmails = approvedData ? approvedData.filter(m => !m.email) : [];
  console.log('Null or empty email members count:', nullEmails.length);
  if (nullEmails.length > 0) {
    console.log('Sample member with null email:', nullEmails[0]);
  }
}

testNullEmailMember();
