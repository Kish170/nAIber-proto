import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from './prisma';
import { authConfig } from './auth.config';
import { buildAuthProviders } from './auth.providers';

export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    providers: buildAuthProviders((email) => prisma.user.findUnique({ where: { email } })),
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
