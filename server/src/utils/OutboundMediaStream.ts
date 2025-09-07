import { WebSocketServer, WebSocket } from 'ws';

interface ActiveConnection {
  streamSid: string;
  twilioWs: WebSocket;
  elevenLabsWs: WebSocket | null;
  callSid?: string;
  conversationId?: string;
  keepAliveInterval?: NodeJS.Timeout;
}

const activeConnections = new Map<string, ActiveConnection>();

export function setupOutboundMediaStream(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket) => {
    console.log('[Twilio] Media stream connected');

    let streamSid: string | null = null;
    let elevenLabsWs: WebSocket | null = null;

    const connectToElevenLabs = async (agentId: string) => {
      try {
        console.log('[ElevenLabs] Connecting with agent ID:', agentId);
        
        const response = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
          {
            headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
          }
        );

        if (!response.ok) {
          throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
        }

        const responseData = await response.json();
        console.log('[ElevenLabs] Got signed URL response:', { 
          status: response.status,
          hasSignedUrl: !!responseData.signed_url 
        });
        
        const { signed_url } = responseData;
        elevenLabsWs = new WebSocket(signed_url);

        elevenLabsWs.on('open', () => {
          console.log('[ElevenLabs] Connected successfully');
          
          if (streamSid && activeConnections.has(streamSid)) {
            const connection = activeConnections.get(streamSid)!;
            connection.elevenLabsWs = elevenLabsWs;
            
            connection.keepAliveInterval = setInterval(() => {
              if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
                elevenLabsWs.ping();
                console.log('[ElevenLabs] Sent keepalive ping');
              }
            }, 30000);
            
            activeConnections.set(streamSid, connection);
          }

          const initMessage = {
            type: 'conversation_initiation_client_data',
            conversation_config_override: {
              agent: {
                auto_start_conversation: true
              }
            }
          };

          elevenLabsWs!.send(JSON.stringify(initMessage));
          console.log('[ElevenLabs] Sent initialization message');
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

        elevenLabsWs.on('error', (error) => {
          console.error('[ElevenLabs] WebSocket error:', error);
        });
        
        elevenLabsWs.on('close', (code, reason) => {
          console.log('[ElevenLabs] Closed with code:', code, 'reason:', reason.toString());
          
          if (streamSid && activeConnections.has(streamSid)) {
            const connection = activeConnections.get(streamSid)!;
            if (connection.keepAliveInterval) {
              clearInterval(connection.keepAliveInterval);
              console.log('[ElevenLabs] Cleared keepalive interval');
            }
          }
          
        });
      } catch (err) {
        console.error('[ElevenLabs] Failed to connect:', err);
      }
    };

    ws.on('message', msg => {
      try {
        const data = JSON.parse(msg.toString());

        switch (data.event) {
          case 'start':
            streamSid = data.start.streamSid;
            const agentId = data.start.customParameters?.agent_id
            
            activeConnections.set(streamSid!, {
              streamSid: streamSid!,
              twilioWs: ws,
              elevenLabsWs: null,
              callSid: data.start.callSid
            });
            
            if (agentId) {
              connectToElevenLabs(agentId);
            } else {
              console.error('[Twilio WS] No agent_id found in customParameters');
            }
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
      console.log('[Twilio] Media stream disconnected');
      if (streamSid && activeConnections.has(streamSid)) {
        const connection = activeConnections.get(streamSid)!;
        
        if (connection.keepAliveInterval) {
          clearInterval(connection.keepAliveInterval);
          console.log('[Twilio] Cleared keepalive interval on disconnect');
        }
        
        if (connection.elevenLabsWs) {
          connection.elevenLabsWs.close();
        }
        
        activeConnections.delete(streamSid);
      }
      elevenLabsWs?.close();
    });
  });
}

export function getActiveConnections() {
  return Array.from(activeConnections.entries()).map(([streamSid, connection]) => ({
    streamSid,
    callSid: connection.callSid,
    hasElevenLabsWs: !!connection.elevenLabsWs,
    twilioWsState: connection.twilioWs.readyState,
    elevenLabsWsState: connection.elevenLabsWs?.readyState
  }));
}

export function closeElevenLabsConnections() {
  for (const [streamSid, connection] of activeConnections) {
    if (connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
      connection.elevenLabsWs.close();
      console.log(`[Cleanup] Closed ElevenLabs WS for ${streamSid}`);
    }
  }
}
