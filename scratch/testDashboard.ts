import { supabaseAnon } from 'd:/Desktop/MaterialDataManagementSystem/backend/src/config/supabase';

async function test() {
  const { data, error } = await supabaseAnon.auth.signInWithPassword({
    email: 'qa-admin@mdms-test.local',
    password: 'TestPassword123!'
  });
  if (error) {
    console.error('Sign in error:', error);
    return;
  }
  const token = data.session.access_token;
  try {
    const res = await fetch('http://localhost:3001/api/dashboard', {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.log('API /dashboard status:', res.status);
    const body = await res.text();
    console.log('API /dashboard body:', body);
  } catch (err: any) {
    console.error('API /dashboard error:', err.message);
  }
}
test();

