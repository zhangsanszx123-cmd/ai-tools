'use client'

import { createAuthClient } from 'better-auth/react'

// Same-origin requests; database credentials and CA never enter the browser.
export const authClient = createAuthClient()
