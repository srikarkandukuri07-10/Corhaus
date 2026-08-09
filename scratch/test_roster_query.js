const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function testRosterQuery() {
  const { data: latestClass } = await supabase
    .from('classes')
    .select('*')
    .ilike('title', '%Evening%')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log('Latest Class:', latestClass);

  if (!latestClass) return;

  const classId = latestClass.id;

  // Test 1: Direct select bookings without join
  const { data: bk1, error: err1 } = await supabase.from('bookings').select('*').eq('class_id', classId);
  console.log('Query 1 (Plain select *):', bk1, err1);

  // Test 2: Select with approved_members join
  const { data: bk2, error: err2 } = await supabase
    .from('bookings')
    .select('*, approved_members(id, full_name, email)')
    .eq('class_id', classId);
  console.log('Query 2 (With approved_members join):', bk2, err2);

  // Test 3: Select with profiles join
  const { data: bk3, error: err3 } = await supabase
    .from('bookings')
    .select('*, profiles(id, full_name, email)')
    .eq('class_id', classId);
  console.log('Query 3 (With profiles join):', bk3, err3);
}

testRosterQuery();
