// Fake Supabase client to prevent frontend crashes after removing @supabase/supabase-js
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: async () => {},
    resetPasswordForEmail: async () => {
      return { error: new Error("Recuperação desativada. Por favor, contate a administração.") };
    }
  }
};
