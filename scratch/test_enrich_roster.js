const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function testEnrichRoster() {
  const classId = '37ad75f7-6f14-4b17-8fe1-a888497e91a6'; // Evening class ID

  const [bkRes, amRes] = await Promise.all([
    supabase.from('bookings').select('*, profiles(id, full_name, email, phone_number)').eq('class_id', classId),
    supabase.from('approved_members').select('id, full_name, email, phone_number'),
  ]);

  const rawBookings = bkRes.data || [];
  const approvedMembers = amRes.data || [];

  const amByEmail = {};
  approvedMembers.forEach(m => {
    if (m.email) amByEmail[m.email.toLowerCase()] = m;
  });

  const enriched = rawBookings.map(b => {
    const p = b.profiles || {};
    const email = p.email || '';
    const am = email ? amByEmail[email.toLowerCase()] : null;
    const name = am?.full_name || p.full_name || email.split('@')[0] || 'Member';

    return {
      ...b,
      approved_members: {
        id: am?.id || p.id || b.member_id,
        full_name: name,
        email: email,
        phone_number: am?.phone_number || p.phone_number || 'N/A',
      }
    };
  });

  console.log('ENRICHED BOOKINGS RESULT:', JSON.stringify(enriched, null, 2));
}

testEnrichRoster();
