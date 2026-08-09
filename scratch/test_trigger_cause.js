const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function testTriggerCause() {
  const testEmail = `test_trigger_${Date.now()}@gmail.com`;

  console.log('Testing createUser for:', testEmail);

  // Let's test creating user without email_confirm or with different fields
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      email: testEmail,
      email_confirm: true,
      user_metadata: {
        full_name: 'Test Trigger',
        phone_number: '9876543210',
      }
    })
  });

  const status = res.status;
  const body = await res.json();
  console.log('Response Status:', status);
  console.log('Response Body:', body);
}

testTriggerCause();
