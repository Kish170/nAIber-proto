import bcrypt from 'bcryptjs';

export type DemoUser = {
    id: string;
    email: string | null;
    name?: string | null;
    image?: string | null;
    emailVerified?: Date | null;
};

type DemoCredentials = Record<string, unknown> | undefined;
type FindUserByEmail = (email: string) => Promise<DemoUser | null>;

export async function authorizeDemo(
    credentials: DemoCredentials,
    findUserByEmail: FindUserByEmail,
    env: NodeJS.ProcessEnv = process.env
): Promise<DemoUser | null> {
    const email = typeof credentials?.email === 'string' ? credentials.email.trim() : '';
    const password = typeof credentials?.password === 'string' ? credentials.password : '';
    const debug = (reason: string, extra: Record<string, unknown> = {}) => {
        if (env.NODE_ENV === 'production') {
            return;
        }
    };

    if (!email || !password) {
        debug('missing_email_or_password');
        return null;
    }

    if (email !== env.DEMO_CAREGIVER_EMAIL) {
        debug('email_mismatch');
        return null;
    }

    const passwordHash = env.DEMO_CAREGIVER_PASSWORD_HASH;
    if (!passwordHash) {
        debug('missing_password_hash');
        return null;
    }

    const isPasswordValid = await bcrypt.compare(password, passwordHash);
    if (!isPasswordValid) {
        debug('password_mismatch');
        return null;
    }

    const user = await findUserByEmail(email);
    debug('lookup_complete', { userFound: Boolean(user) });
    return user;
}
