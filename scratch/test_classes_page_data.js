const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function testAdminClassesPageData() {
  const { data: bks } = await supabase
    .from('bookings')
    .select('*, classes(id, title, instructor, class_date, class_time, max_capacity, location_room, category)');

  console.log('Bookings with classes join count:', bks ? bks.length : 0);
  console.log('Bookings sample:', JSON.stringify(bks, null, 2));
}

testAdminClassesPageData();
