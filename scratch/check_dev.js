const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
  }
});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, key);
const email = 'kandukurisrikar10@gmail.com';

async function check() {
  console.log('=== CHECKING EMAIL:', email, '===');

  const { data: approved } = await supabase.from('approved_members').select('*').ilike('email', email);
  console.log('approved_members:', approved);

  const { data: profiles } = await supabase.from('profiles').select('*').ilike('email', email);
  console.log('profiles:', profiles);

  const { data: staff } = await supabase.from('staff_members').select('*').ilike('email', email);
  console.log('staff_members:', staff);

  const { data: customers } = await supabase.from('customers').select('*').ilike('email', email);
  console.log('customers:', customers);

  const { data: authUsers } = await supabase.auth.admin.listUsers();
  const devAuth = (authUsers.users || []).filter(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  console.log('auth.users:', devAuth.map(u => ({ id: u.id, email: u.email, created_at: u.created_at })));
}

check();
