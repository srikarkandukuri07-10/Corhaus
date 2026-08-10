const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function printClasses() {
  const { data: cls } = await supabase.from('classes').select('*');
  console.log('CLASSES IN DB:');
  console.log(JSON.stringify(cls, null, 2));

  const { data: bks } = await supabase.from('bookings').select('*');
  console.log('BOOKINGS IN DB:');
  console.log(JSON.stringify(bks, null, 2));
}

printClasses();
