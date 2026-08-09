const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function testCreateWithId() {
  const email = 'kandukurisrujana1999@gmail.com';
  const approvedId = '5bfb6c5f-7d01-44fd-89d5-108b8cc608f0';
  const tempPassword = `Corhaus_Member_Auth_${email}`;

  console.log('Testing auth.admin.createUser WITH explicit ID matching approved_members...');

  const { data: created, error: crtErr } = await supabase.auth.admin.createUser({
    id: approvedId,
    email: email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: 'Kandukuri Srujana',
      phone_number: '09121599088',
    }
  });

  console.log('createUser result error:', crtErr);
  console.log('created user:', created?.user ? { id: created.user.id, email: created.user.email } : null);
}

testCreateWithId();
