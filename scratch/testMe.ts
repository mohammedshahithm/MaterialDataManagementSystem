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
  console.log('Access token acquired, user id:', data.user?.id);
  const token = data.session.access_token;
  try {
    const res = await fetch('http://localhost:3001/api/auth/me', {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.log('API /auth/me status:', res.status);
    const body = await res.text();
    console.log('API /auth/me body:', body);
  } catch (err: any) {
    console.error('API /auth/me error:', err.message);
  }
}
test();
