import { WebSocketServer, WebSocket } from 'ws';

export function setupOutboundMediaStream(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket, req) => {
    console.log('[Twilio] Media stream connected');

    let streamSid: string | null = null;
    let elevenLabsWs: WebSocket | null = null;

    const connectToElevenLabs = async () => {
      try {
        const response = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${process.env.ELEVENLABS_AGENT_ID}`,
          {
            headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
          }
        );

        const { signed_url } = await response.json();
        elevenLabsWs = new WebSocket(signed_url);

        elevenLabsWs.on('open', () => {
          console.log('[ElevenLabs] Connected');

          // 🟢 This is the key part to make the agent speak
          const initMessage = {
            type: 'conversation_initiation_client_data',
            conversation_config_override: {
              agent: {
                auto_start_conversation: true
              }
            }
          };

          elevenLabsWs!.send(JSON.stringify(initMessage));
        });

        elevenLabsWs.on('message', data => {
          const msg = JSON.parse(data.toString());
          if (msg.audio?.chunk || msg.audio_event?.audio_base_64) {
            ws.send(
              JSON.stringify({
                event: 'media',
                streamSid,
                media: {
                  payload: msg.audio?.chunk || msg.audio_event.audio_base_64,
                },
              })
            );
          }
        });

        elevenLabsWs.on('error', console.error);
        elevenLabsWs.on('close', () => console.log('[ElevenLabs] Closed'));
      } catch (err) {
        console.error('[ElevenLabs] Failed to connect:', err);
      }
    };

    connectToElevenLabs();

    ws.on('message', msg => {
      try {
        const data = JSON.parse(msg.toString());

        switch (data.event) {
          case 'start':
            streamSid = data.start.streamSid;
            break;
          case 'media':
            if (elevenLabsWs?.readyState === WebSocket.OPEN) {
              elevenLabsWs.send(
                JSON.stringify({
                  user_audio_chunk: Buffer.from(data.media.payload, 'base64').toString('base64'),
                })
              );
            }
            break;
          case 'stop':
            elevenLabsWs?.close();
            break;
        }
      } catch (e) {
        console.error('[Twilio WS] Error:', e);
      }
    });

    ws.on('close', () => {
      elevenLabsWs?.close();
    });
  });
}
