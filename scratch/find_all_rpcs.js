const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function testRpcs() {
  const rpcs = [
    'delete_member_completely',
    'book_member_class_session',
    'cancel_member_class_booking',
    'reschedule_member_class_booking',
    'generate_invoice_number',
    'check_plan_expiry',
    'get_booking_count',
    'is_admin',
    'is_active_member'
  ];

  for (const rpc of rpcs) {
    const { data, error } = await supabase.rpc(rpc, { p_email: 'test@test.com' });
    console.log(`RPC '${rpc}':`, error ? error.message : 'EXISTS!');
  }
}

testRpcs();
