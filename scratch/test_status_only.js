const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function testBookingStatusOnly() {
  const { data: bks } = await supabase.from('bookings').select('id, booking_status').limit(1);
  if (!bks || bks.length === 0) return;
  const id = bks[0].id;
  const res = await supabase.from('bookings').update({ booking_status: 'checked_in' }).eq('id', id);
  console.log('Result for booking_status ONLY:', res.error ? res.error.message : 'SUCCESS!');
}

testBookingStatusOnly();
