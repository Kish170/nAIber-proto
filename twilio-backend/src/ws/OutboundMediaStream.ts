import { WebSocketServer, WebSocket } from 'ws';
import Twilio from 'twilio';

const twilioClient = Twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);

// Connection manager to track active connections
interface ActiveConnection {
  streamSid: string;
  twilioWs: WebSocket;
  elevenLabsWs: WebSocket | null;
  callSid?: string;
  conversationId?: string;
}

const activeConnections = new Map<string, ActiveConnection>();

export function setupOutboundMediaStream(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket, req) => {
    console.log('[Twilio] Media stream connected');

    let streamSid: string | null = null;
    let elevenLabsWs: WebSocket | null = null;

    const connectToElevenLabs = async (agentId: string) => {
      try {
        const response = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
          {
            headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
          }
        );

        const { signed_url } = await response.json();
        elevenLabsWs = new WebSocket(signed_url);

        elevenLabsWs.on('open', () => {
          console.log('[ElevenLabs] Connected');
          
          if (streamSid && activeConnections.has(streamSid)) {
            const connection = activeConnections.get(streamSid)!;
            connection.elevenLabsWs = elevenLabsWs;
            activeConnections.set(streamSid, connection);
          }

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
        if (connection.elevenLabsWs) {
          connection.elevenLabsWs.close();
        }
        activeConnections.delete(streamSid);
      }
      elevenLabsWs?.close();
    });
  });
}

// export async function endCall(streamSid: string) {
//   try {
//     const connection = activeConnections.get(streamSid);
//     if (!connection) {
//       console.error(`[End Call] Connection not found for streamSid: ${streamSid}`);
//       return { success: false, error: 'Connection not found' };
//     }

//     if (connection.callSid) {
//       await twilioClient.calls(connection.callSid).update({ status: 'completed' });
//       console.log(`[End Call] Twilio call ${connection.callSid} ended`);
//     }

//     if (connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
//       connection.elevenLabsWs.close();
//       console.log('[End Call] ElevenLabs WebSocket closed');
//     }

//     if (connection.twilioWs && connection.twilioWs.readyState === WebSocket.OPEN) {
//       connection.twilioWs.close();
//       console.log('[End Call] Twilio WebSocket closed');
//     }

//     activeConnections.delete(streamSid);

//     return { success: true, message: 'Call ended successfully' };
//   } catch (error) {
//     console.error('[End Call] Error ending call:', error);
//     return { success: false, error: 'Failed to end call' };
//   }
// }

// export async function endAllCalls() {
//   try {
//     const promises = Array.from(activeConnections.keys()).map(streamSid => endCall(streamSid));
//     const results = await Promise.all(promises);
    
//     console.log(`[End All Calls] Ended ${results.length} calls`);
//     return { success: true, message: `Ended ${results.length} calls` };
//   } catch (error) {
//     console.error('[End All Calls] Error ending calls:', error);
//     return { success: false, error: 'Failed to end calls' };
//   }
// }

export function getActiveConnections() {
  return Array.from(activeConnections.entries()).map(([streamSid, connection]) => ({
    streamSid,
    callSid: connection.callSid,
    hasElevenLabsWs: !!connection.elevenLabsWs,
    twilioWsState: connection.twilioWs.readyState,
    elevenLabsWsState: connection.elevenLabsWs?.readyState
  }));
}

// Function to close ElevenLabs WebSocket connections (stops AI)
export function closeElevenLabsConnections() {
  for (const [streamSid, connection] of activeConnections) {
    if (connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
      connection.elevenLabsWs.close();
      console.log(`[Cleanup] Closed ElevenLabs WS for ${streamSid}`);
    }
  }
}
