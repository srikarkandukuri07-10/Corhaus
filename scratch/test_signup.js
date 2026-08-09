const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const anonKey = 'sb_publishable_Kl-7MDhLL15xzwrZoCwkGQ_xTgxmMIB';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const anonClient = createClient(url, anonKey);
const serviceClient = createClient(url, serviceKey);

async function testSignUp(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const tempPassword = `Corhaus_Member_Auth_${normalizedEmail}`;

  console.log('Testing anonClient.auth.signUp...');
  const { data: signData, error: signErr } = await anonClient.auth.signUp({
    email: normalizedEmail,
    password: tempPassword,
    options: {
      data: {
        full_name: 'Kandukuri Srujana',
      }
    }
  });
  console.log('signUp data:', signData ? { user_id: signData.user?.id, session: !!signData.session } : null, 'error:', signErr);
}

testSignUp('kandukurisrujana1999@gmail.com');
