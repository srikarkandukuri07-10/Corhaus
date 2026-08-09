const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function checkAllUsers() {
  const { data: usersData, error } = await supabase.auth.admin.listUsers();
  console.log('Total users count:', usersData?.users?.length, 'error:', error);
  if (usersData?.users) {
    usersData.users.forEach(u => {
      console.log(`User: ${u.email} | id: ${u.id} | provider: ${u.app_metadata?.provider} | metadata:`, u.user_metadata);
    });
  }
}

checkAllUsers();
