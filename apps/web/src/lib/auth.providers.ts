import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { authorizeDemo, type DemoUser } from './demo-credentials';

type FindUserByEmail = (email: string) => Promise<DemoUser | null>;

export function buildAuthProviders(
    findUserByEmail: FindUserByEmail,
    env: NodeJS.ProcessEnv = process.env
) {
    const providers = [...(authConfig.providers ?? [])];

    if (env.DEMO_AUTH_ENABLED === 'true') {
        providers.push(
            Credentials({
                name: 'demo',
                credentials: {
                    email: { label: 'Email', type: 'email' },
                    password: { label: 'Password', type: 'password' },
                },
                async authorize(credentials) {
                    return authorizeDemo(credentials, findUserByEmail, env);
                },
            })
        );
    }

    return providers;
}
