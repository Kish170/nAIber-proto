
export interface NgrokUrls {
    baseUrl: string;
    twilioUrl: string;
    streamUrl: string;
}

interface NgrokTunnel {
    name: string;
    public_url: string;
    proto: string;
    config?: {
        addr?: string;
    };
}

interface NgrokApiResponse {
    tunnels: NgrokTunnel[];
}

export async function fetchNgrokUrls(
    ngrokApiUrl: string = 'http://ngrok:4040/api/tunnels',
    maxRetries: number = 10
): Promise<NgrokUrls | null> {

    console.log('[Ngrok] Fetching tunnel URLs from API...');

     for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(ngrokApiUrl);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = (await response.json()) as NgrokApiResponse;

            if (!data.tunnels || data.tunnels.length === 0) {
                console.log(`[Ngrok] Waiting for tunnels... (${i + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            const serverTunnel = data.tunnels.find(
                (t) => t.config?.addr?.includes(':3000') && t.proto === 'https'
            );

            if (!serverTunnel) {
                console.log(`[Ngrok] Server tunnel not ready... (${i + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            const baseUrl = serverTunnel.public_url;
            const streamUrl = baseUrl.replace('https://', 'wss://') + '/outbound-media-stream';

            console.log('[Ngrok] ✅ Tunnel URLs retrieved successfully:');
            console.log(`[Ngrok]    Base URL: ${baseUrl}`);
            console.log(`[Ngrok]    Stream URL: ${streamUrl}`);

            return {
                baseUrl,
                twilioUrl: baseUrl,
                streamUrl
            };

        } catch (error) {
            if (i === 0) {
                console.log('[Ngrok] Waiting for ngrok to be ready...');
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    console.warn('[Ngrok] ⚠️  Could not fetch ngrok URLs after retries');
    console.warn('[Ngrok]    Falling back to environment variables');
    return null;
}

export function getNgrokUrlsFromEnv(): NgrokUrls {
    return {
        baseUrl: process.env.BASE_URL || '',
        twilioUrl: process.env.TWILIO_URL || '',
        streamUrl: process.env.STREAM_URL || ''
    };
}

export async function getNgrokUrls(): Promise<NgrokUrls> {
    const useDynamic = process.env.USE_DYNAMIC_NGROK === 'true';
    const ngrokApiUrl = process.env.NGROK_API_URL;

    if (useDynamic && ngrokApiUrl) {
        const urls = await fetchNgrokUrls(ngrokApiUrl);
        if (urls) {
            console.log('[Ngrok] Using dynamic URLs from ngrok API');
            return urls;
        }
    }

    console.log('[Ngrok] Using static URLs from environment variables');
    return getNgrokUrlsFromEnv();
}
