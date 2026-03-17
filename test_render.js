import React from 'react';
import { create } from 'react-test-renderer';
import App from './src/App.jsx';

// Stub out Supabase client creating if it tries to throw
jest.mock('./src/lib/supabase.js', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: {} }) }) }),
      upsert: async () => {}
    }),
    channel: () => ({
      on: () => ({ subscribe: () => {} }),
    }),
    removeChannel: () => {}
  }
}));

try {
  const root = create(<App />);
  console.log("Rendered successfully");
} catch (e) {
  console.error("Crash during render:");
  console.error(e.stack);
}
