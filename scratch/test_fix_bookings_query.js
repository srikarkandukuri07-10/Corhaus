const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function testFixBookingsQuery() {
  const [bksRes, clsRes] = await Promise.all([
    supabase.from('bookings').select('*').order('created_at', { ascending: false }),
    supabase.from('classes').select('id, title, instructor, class_date, class_time, max_capacity, location_room, category'),
  ]);

  console.log('Bookings raw count:', bksRes.data ? bksRes.data.length : 0);
  console.log('Classes raw count:', clsRes.data ? clsRes.data.length : 0);

  const classesById = {};
  (clsRes.data || []).forEach(c => {
    classesById[c.id] = c;
  });

  const enriched = (bksRes.data || []).map(b => ({
    ...b,
    classes: classesById[b.class_id] || null
  }));

  console.log('Enriched bookings result count:', enriched.length);
  console.log('Enriched bookings sample:', JSON.stringify(enriched[0], null, 2));
}

testFixBookingsQuery();
