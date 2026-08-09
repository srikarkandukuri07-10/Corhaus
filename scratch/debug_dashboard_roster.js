const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function debugDashboardRoster() {
  console.log('--- FETCHING CLASSES ---');
  const { data: classes } = await supabase.from('classes').select('id, title, class_date, class_time').order('created_at', { ascending: false }).limit(5);
  console.log('Classes:', classes);

  console.log('--- FETCHING BOOKINGS ---');
  const { data: bookings } = await supabase.from('bookings').select('*').order('created_at', { ascending: false }).limit(10);
  console.log('Bookings:', bookings);

  console.log('--- FETCHING ATTENDANCE ---');
  const { data: attendance } = await supabase.from('attendance').select('*').order('created_at', { ascending: false }).limit(10);
  console.log('Attendance:', attendance);
}

debugDashboardRoster();
