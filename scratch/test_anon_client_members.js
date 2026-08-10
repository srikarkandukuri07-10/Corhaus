const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const anonKey = 'sb_publishable_Kl-7MDhLL15xzwrZoCwkGQ_xTgxmMIB';

const supabase = createClient(url, anonKey);

async function testAnonMembersFetch() {
  console.log('--- Testing Anon/Browser Client Queries ---');
  const res1 = await supabase.from('approved_members').select('*');
  console.log('approved_members:', res1.error ? res1.error.message : res1.data.length);

  const res2 = await supabase.from('profiles').select('email, avatar_url');
  console.log('profiles:', res2.error ? res2.error.message : res2.data.length);

  const res3 = await supabase.from('member_purchased_plans').select('*');
  console.log('member_purchased_plans:', res3.error ? res3.error.message : res3.data.length);

  const res4 = await supabase.from('customers').select('id, approved_member_id');
  console.log('customers:', res4.error ? res4.error.message : res4.data.length);

  const res5 = await supabase.from('invoices').select('*, invoice_items(*)');
  console.log('invoices:', res5.error ? res5.error.message : res5.data.length);
}

testAnonMembersFetch();
