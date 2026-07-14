/* eslint-disable @typescript-eslint/no-unused-vars */
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // This will refresh session if expired
  const { data: { user } } = await supabase.auth.getUser()

  const isLoginPage = request.nextUrl.pathname.startsWith('/login')
  const isProtected = request.nextUrl.pathname.startsWith('/main') || request.nextUrl.pathname.startsWith('/admin')

  if (!user && isProtected) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Check trusted_device cookie to ensure full login
  const hasTrustedDevice = request.cookies.has('trusted_device')
  
  if (user && !hasTrustedDevice && isProtected) {
    // Session exists but no trusted_device cookie, might be halfway through OTP.
    // Send back to login to finish OTP flow or relogin.
    // Actually, we sign out in actions.ts if OTP is needed, but just in case.
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && hasTrustedDevice && isLoginPage) {
    return NextResponse.redirect(new URL('/main', request.url))
  }

  if (request.nextUrl.pathname === '/') {
    if (user && hasTrustedDevice) {
      return NextResponse.redirect(new URL('/main', request.url))
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}
