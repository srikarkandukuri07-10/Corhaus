const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function testMemberLogin(email) {
  console.log(`=== TESTING MEMBER LOGIN FOR ${email} ===`);
  const normalizedEmail = email.trim().toLowerCase();

  const tempPassword = `Corhaus_Member_Auth_${normalizedEmail}`;

  const { data: usersData, error: listErr } = await supabase.auth.admin.listUsers();
  console.log('listUsers count:', usersData?.users?.length, 'error:', listErr);

  let memberUser = (usersData?.users || []).find(
    (u) => u.email?.trim().toLowerCase() === normalizedEmail
  );

  console.log('memberUser found before create/update:', memberUser ? memberUser.id : 'NO');

  if (memberUser) {
    const { data: updated, error: updErr } = await supabase.auth.admin.updateUserById(memberUser.id, {
      password: tempPassword,
      email_confirm: true,
    });
    console.log('updateUserById result error:', updErr);
  } else {
    const { data: created, error: crtErr } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      email_confirm: true,
    });
    console.log('createUser result error:', crtErr);
    memberUser = created?.user || undefined;
    console.log('created user id:', memberUser?.id);
  }

  if (memberUser) {
    const { data: prof, error: profErr } = await supabase.from("profiles").upsert(
      {
        id: memberUser.id,
        email: normalizedEmail,
        role: "member",
        full_name: "Kandukuri Srujana",
        phone_number: "09121599088",
      },
      { onConflict: "id" }
    );
    console.log('profiles upsert error:', profErr);
  }
}

testMemberLogin('kandukurisrujana1999@gmail.com');
