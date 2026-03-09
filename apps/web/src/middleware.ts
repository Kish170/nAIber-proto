import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(authConfig);

const publicPaths = ['/', '/login', '/signup', '/verify'];

export default auth((req) => {
    const { pathname } = req.nextUrl;

    const isPublic = publicPaths.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`)
    );

    if (isPublic || pathname.startsWith('/api/auth')) {
        return NextResponse.next();
    }

    if (!req.auth) {
        const loginUrl = new URL('/login', req.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
});

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
