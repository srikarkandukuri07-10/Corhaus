const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function testBookingUpdate() {
  const { data: bks } = await supabase.from('bookings').select('id, booking_status').limit(1);
  if (!bks || bks.length === 0) {
    console.log('No bookings found');
    return;
  }
  const id = bks[0].id;
  console.log('Testing update WITH attendance_status on booking ID:', id);
  const res1 = await supabase.from('bookings').update({
    booking_status: 'checked_in',
    attendance_status: 'present',
    checked_in_at: new Date().toISOString()
  }).eq('id', id);

  console.log('Result 1 Error:', res1.error ? res1.error.message : 'SUCCESS!');

  console.log('Testing update WITHOUT attendance_status on booking ID:', id);
  const res2 = await supabase.from('bookings').update({
    booking_status: 'checked_in',
    checked_in_at: new Date().toISOString()
  }).eq('id', id);

  console.log('Result 2 Error:', res2.error ? res2.error.message : 'SUCCESS!');
}

testBookingUpdate();
