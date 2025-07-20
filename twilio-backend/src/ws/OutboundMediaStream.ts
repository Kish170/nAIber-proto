import { WebSocketServer, WebSocket } from 'ws';
import { EmergencyContactCRUD } from './../CRUD/EmergencyContact';
import { BasicInfoCRUD } from './../CRUD/BasicInfo';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const elevenLabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY! });
const emergencyContactCRUD = new EmergencyContactCRUD();
const basicInfoCRUD = new BasicInfoCRUD();

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
            if (agentId) {
              connectToElevenLabs(agentId);
              setUpCallTransfer(agentId);
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
      elevenLabsWs?.close();
    });
  });
}

async function setUpCallTransfer(agentId: string) {
  try {
    console.log('[Transfer Setup] Setting up transfer for agent:', agentId);
    const userID = await basicInfoCRUD.getUserID({ phoneNumber: `${process.env.PHONE_NUMBER}` })
    console.log('[Transfer Setup] Found user ID:', userID);

    if (userID) {
      const emergencyContacts = await emergencyContactCRUD.getEmergencyContactsByUserId(userID)
      console.log('[Transfer Setup] Emergency contacts:', emergencyContacts);

      if (emergencyContacts.length === 0) {
        console.error('[Transfer Setup] No emergency contacts found');
        return;
      }

      const ecNumber = emergencyContacts[0].phoneNumber
      console.log('[Transfer Setup] Using emergency contact:', ecNumber);
      console.log('[Transfer Setup] Phone number type:', typeof ecNumber);
      
      if (!ecNumber) {
        console.error('[Transfer Setup] Emergency contact phone number is null/undefined');
        return;
      }
      
      const transferRules = [
        {
          phone_number: ecNumber,
          condition: 'When the user explicitly states they are in danger, having a medical emergency, or specifically requests to speak with a human operator.',
          transfer_type: 'sip_refer'
        }
      ];
      await elevenLabs.conversationalAi.agents.update(`${agentId}`, {
        conversationConfig: {
          agent: {
            prompt: {
              tools: [
                {
                  type: 'system',
                  name: 'transfer_to_number',
                  description: 'Transfer the user to a human operator based on their request.',
                  params: {
                    system_tool_type: 'transfer_to_number',
                    transfers: transferRules,
                  },
                },
              ],
            },
          },
        },
      });
      console.log('[Transfer Setup] Agent updated successfully with transfer rules');
    } else {
      console.error('[Transfer Setup] No user found for phone number:', process.env.PHONE_NUMBER);
    }
  } catch (error) {
    console.error('[Transfer Setup] Error setting up transfer:', error);
  }
}
