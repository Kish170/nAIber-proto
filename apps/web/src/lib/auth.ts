import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { authConfig } from './auth.config';
import type { Provider } from 'next-auth/providers';

const providers: Provider[] = [...(authConfig.providers ?? [])];

if (process.env.DEMO_AUTH_ENABLED === 'true') {
    providers.push(
        Credentials({
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null;
                if (credentials.email !== process.env.DEMO_CAREGIVER_EMAIL) return null;
                const hash = process.env.DEMO_CAREGIVER_PASSWORD_HASH;
                if (!hash) return null;
                const valid = await bcrypt.compare(credentials.password as string, hash);
                if (!valid) return null;
                return prisma.user.findUnique({ where: { email: credentials.email as string } });
            },
        })
    );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    providers,
    adapter: PrismaAdapter(prisma),
    session: { strategy: 'jwt' },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.sub = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user && token.sub) {
                session.user.id = token.sub;
            }
            return session;
        },
    },
});
