const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function testClassesColumns() {
  const [bkRes, clsRes] = await Promise.all([
    supabase.from('bookings').select('*').order('created_at', { ascending: false }),
    supabase.from('classes').select('*'),
  ]);

  console.log('Bookings err:', bkRes.error);
  console.log('Classes err:', clsRes.error);

  const classesById = {};
  (clsRes.data || []).forEach(c => {
    classesById[c.id] = c;
  });

  const enriched = (bkRes.data || []).map(b => ({
    ...b,
    classes: classesById[b.class_id] || null
  }));

  console.log('Enriched Bookings Count:', enriched.length);
  console.log('Sample Enriched Booking:', JSON.stringify(enriched[0], null, 2));
}

testClassesColumns();
