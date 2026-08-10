const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

async function testMembersPageCrash() {
  const { data: profilesData } = await supabase.from('profiles').select('email, avatar_url');
  console.log('Profiles Data:', profilesData);

  try {
    const avatarMap = new Map(
      profilesData?.map((p) => [p.email.toLowerCase(), p.avatar_url]) || []
    );
    console.log('Avatar map created successfully!');
  } catch (err) {
    console.error('CRASH IN MAP:', err.message);
  }

  try {
    const safeAvatarMap = new Map(
      profilesData?.filter(p => p && p.email).map((p) => [p.email.toLowerCase(), p.avatar_url]) || []
    );
    console.log('Safe avatar map created successfully! Size:', safeAvatarMap.size);
  } catch (err) {
    console.error('CRASH IN SAFE MAP:', err.message);
  }
}

testMembersPageCrash();
