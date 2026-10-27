'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  revalidatePath('/', 'layout');
  if (error) throw new Error('Sign-out could not be fully confirmed. Please retry.');
  redirect('/login');
}
