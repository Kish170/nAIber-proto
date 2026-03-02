import neo4j, { Driver, Session } from 'neo4j-driver';

export interface Neo4jClientConfigs {
    username: string;
    password: string;
    uri: string;
    database?: string;
}

export class Neo4jClient {
    private static instance: Neo4jClient | null = null;
    private driver: Driver;
    private readonly database: string;

    private constructor(configs: Neo4jClientConfigs) {
        if (!configs.username || !configs.password || !configs.uri) {
            throw new Error('Neo4j configuration error: username, password, and uri are required');
        }

        this.driver = neo4j.driver(
            configs.uri,
            neo4j.auth.basic(configs.username, configs.password),
            { disableLosslessIntegers: true }
        );

        this.database = configs.database ?? 'nAIber-KG';
    }

    static getInstance(configs?: Neo4jClientConfigs): Neo4jClient {
        if (!Neo4jClient.instance) {
            if (!configs) throw new Error('Neo4jClient not initialized — provide configs on first call');
            Neo4jClient.instance = new Neo4jClient(configs);
        }
        return Neo4jClient.instance;
    }

    async verifyConnectivity(): Promise<void> {
        await this.driver.verifyConnectivity();
        console.log('[Neo4j] Connection established');
    }

    session(): Session {
        return this.driver.session({ database: this.database });
    }

    async closeDriver(): Promise<void> {
        await this.driver.close();
        Neo4jClient.instance = null;
    }

    async closeSession(session: Session): Promise<void> {
        await session.close();
    }
}

