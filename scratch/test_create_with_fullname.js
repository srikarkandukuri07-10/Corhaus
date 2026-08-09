const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function testCreateWithFullName() {
  const email = 'kandukurisrujana1999@gmail.com';
  const tempPassword = `Corhaus_Member_Auth_${email}`;

  console.log('Testing auth.admin.createUser WITH full_name in user_metadata...');

  const { data: created, error: crtErr } = await supabase.auth.admin.createUser({
    email: email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: 'Kandukuri Srujana',
    }
  });

  console.log('createUser error:', crtErr);
  console.log('created user:', created?.user ? { id: created.user.id, email: created.user.email } : null);

  if (created?.user) {
    const { data: prof, error: profErr } = await supabase.from("profiles").upsert(
      {
        id: created.user.id,
        email: email,
        role: "member",
        full_name: "Kandukuri Srujana",
        phone_number: "09121599088",
      },
      { onConflict: "id" }
    );
    console.log('profiles upsert error:', profErr);
  }
}

testCreateWithFullName();
