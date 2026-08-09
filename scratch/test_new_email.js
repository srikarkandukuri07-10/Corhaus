const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function testNewEmail() {
  const email = `testmember_${Date.now()}@gmail.com`;
  console.log('Testing createUser with email:', email);

  const { data: created, error: crtErr } = await supabase.auth.admin.createUser({
    email: email,
    password: 'TestPassword123!',
    email_confirm: true,
    user_metadata: {
      full_name: 'Test Member',
      phone_number: '9876543210',
    }
  });

  console.log('createUser result error:', crtErr);
  console.log('created user:', created?.user ? { id: created.user.id, email: created.user.email } : null);

  if (created?.user) {
    await supabase.auth.admin.deleteUser(created.user.id);
  }
}

testNewEmail();
