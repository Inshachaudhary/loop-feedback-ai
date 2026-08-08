'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from 'next-auth/react'
import { useState } from 'react'

export function Providers({ children }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60000, refetchOnWindowFocus: false } } }))
  // Disable window-focus refetch + polling to avoid unnecessary `status = "loading"`
  // flickers that would otherwise unmount protected pages while a refetch is in-flight.
  return <SessionProvider refetchInterval={0} refetchOnWindowFocus={false}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></SessionProvider>
}
