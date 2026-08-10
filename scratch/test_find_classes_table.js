const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function testFindClassesTable() {
  const t1 = await supabase.from('classes').select('*');
  console.log('classes:', t1.data ? t1.data.length : 0, t1.error);

  const t2 = await supabase.from('class_types').select('*');
  console.log('class_types:', t2.data ? t2.data.length : 0, t2.error);
}

testFindClassesTable();
