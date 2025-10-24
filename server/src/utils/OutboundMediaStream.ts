import { WebSocketServer, WebSocket } from 'ws';
import { ConversationMemoryService } from '../services/ConversationContextService';
import { LangChainTools } from '../tools/LangChainTools';
import { BasicInfoTools } from '../tools/dbUtils';
import { PersonalizationService } from '../services/PersonalizationService';
import { userContextManager } from './UserContext';

interface ActiveConnection {
  streamSid: string;
  twilioWs: WebSocket;
  elevenLabsWs: WebSocket | null;
  callSid?: string;
  conversationId: String;
  keepAliveInterval?: NodeJS.Timeout;
}

const activeConnections = new Map<string, ActiveConnection>()
const langTools = new LangChainTools
const memoryService = new ConversationMemoryService
const basicInfo = new BasicInfoTools
const personalizationService = new PersonalizationService

export async function setupOutboundMediaStream(wss: WebSocketServer) {
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
        console.log(`[ElevenLabs] Creating WebSocket connection for streamSid: ${streamSid}`);
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

        elevenLabsWs.on('message', async data => {
          const msg = JSON.parse(data.toString());
          
          // Only log non-audio and non-ping messages
          if (msg.type !== 'audio' && msg.type !== 'ping') {
            console.log('[ElevenLabs] Received message:', {
              type: msg.type,
              conversation_id: msg.conversation_id,
              messageKeys: Object.keys(msg)
            });
          }
          
          // Capture conversation ID from conversation_initiation_metadata_event
          if (msg.conversation_initiation_metadata_event?.conversation_id && streamSid && activeConnections.has(streamSid)) {
            const connection = activeConnections.get(streamSid)!;
            if (!connection.conversationId || connection.conversationId === '') {
              const conversationId = msg.conversation_initiation_metadata_event.conversation_id;
              connection.conversationId = conversationId;
              console.log(`[ElevenLabs] ✅ Captured conversation ID: ${conversationId}`);
              activeConnections.set(streamSid, connection);

              // Update user context with conversation ID
              console.log('[UserContext] Updating context with ElevenLabs conversation ID');
              userContextManager.updateConversationId(streamSid, conversationId);

              // Also update the phone number context if it exists
              const phoneContext = userContextManager.getContextByPhone(process.env.PHONE_NUMBER!);
              if (phoneContext) {
                phoneContext.updateConversationId(conversationId);
                console.log('[UserContext] ✅ Updated conversation ID in cached contexts');
              }

              // Update database directly with new conversation ID immediately
              try {
                console.log(`[Database] Looking up user by phone number: ${process.env.PHONE_NUMBER}`);
                const userId = await basicInfo.getUserID({ phoneNumber: process.env.PHONE_NUMBER! });

                if (userId) {
                  console.log(`[Database] Found userId: ${userId}, updating conversation ID to: ${conversationId}`);
                  await basicInfo.updateConversationId(userId, conversationId);
                  console.log('[Database] ✅ Successfully updated conversation ID in database');
                } else {
                  console.log('[Database] ⚠️ No user found for phone number, skipping database update');
                }
              } catch (dbError) {
                console.error('[Database] ❌ Failed to update conversation ID in database:', dbError);
              }
            }
          }
          
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

        elevenLabsWs.on('open', () => {
          console.log(`[ElevenLabs] WebSocket opened for streamSid: ${streamSid}`);
        });

        elevenLabsWs.on('error', (error) => {
          console.error(`[ElevenLabs] WebSocket error for streamSid ${streamSid}:`, error);
        });
        
        elevenLabsWs.on('close', async (code, reason) => {
          console.log(`[ElevenLabs] WebSocket CLOSED for streamSid: ${streamSid}, code: ${code}, reason: ${reason.toString()}`);
          
          if (streamSid && activeConnections.has(streamSid)) {
            const connection = activeConnections.get(streamSid)!;
            const conversationID = connection.conversationId?.toString();
            
            console.log('[ElevenLabs] Connection data at close:', {
              streamSid,
              hasConnection: !!connection,
              conversationId: connection.conversationId,
              conversationID,
              connectionKeys: Object.keys(connection)
            });
            
            if (conversationID) {
              console.log(`[Memory Service] Processing conversation summary for conversation: ${conversationID}`);

              // Get user ID using phone number from env
              console.log(`[Memory Service] Getting user ID using phone number from env`);
              const userId = await basicInfo.getUserID({ phoneNumber: process.env.PHONE_NUMBER! });
              
              if (!userId) {
                console.warn(`[Memory Service] No user found for phone number: ${process.env.PHONE_NUMBER}. Skipping memory processing.`);
                return;
              }

              // Get current user data to check if conversation ID is different
              const currentUser = await basicInfo.getAllUserInfo(userId);
              if (currentUser && currentUser.conversationID !== conversationID) {
                console.log(`[Memory Service] Updating user profile with new conversation ID: ${conversationID} (previous: ${currentUser.conversationID})`);
                await basicInfo.updateConversationId(userId, conversationID);
              } else {
                console.log(`[Memory Service] Conversation ID already up to date: ${conversationID}`);
              }
              
              try {
                console.log('[Memory Service] Initializing collection...');
                await memoryService.initializeCollection();
                console.log(`[Memory Service] Fetching transcript for conversation: ${conversationID}`);
                const transcript = await memoryService.getTranscriptWithRetry(conversationID);
                console.log(`[Memory Service] Transcript: ${transcript}`)

                if (!transcript || transcript.length === 0) {
                  console.warn(`[Memory Service] No transcript found for conversation: ${conversationID}`);
                  return;
                }
                console.log('[Memory Service] Extracting conversation highlights...');
                const conversationSummary = await langTools.extractConversation(transcript);
                
                if (!conversationSummary) {
                  console.warn(`[Memory Service] Failed to extract summary for conversation: ${conversationID}`);
                  return;
                }
                
                
                console.log(`[Memory Service] Saving conversation highlights for user: ${userId}`);
                const result = await memoryService.saveConversationHighlights(userId, conversationID, conversationSummary);

                console.log(`[Memory Service] Successfully saved ${result.highlightsStored} highlights for conversation: ${conversationID}`);

                // Update lastConversationId now that the conversation has ended
                console.log(`[Personalization] Updating lastConversationId to: ${conversationID}`);
                try {
                  await personalizationService.updateLastConversationId(conversationID);
                  console.log(`[Personalization] ✅ Successfully updated lastConversationId to: ${conversationID}`);

                  // Update user context cache with new lastConversationId
                  console.log('[UserContext] Updating cached lastConversationId at call end');
                  const updated = userContextManager.updateLastConversationId(conversationID, conversationID);
                  if (updated) {
                    console.log('[UserContext] ✅ Successfully updated cached lastConversationId');
                  }
                } catch (personalizationError) {
                  console.error(`[Personalization] ❌ Failed to update lastConversationId:`, personalizationError);
                }

              } catch (error) {
                console.error(`[Memory Service] Error processing conversation ${conversationID}:`, error);
                
                if (error instanceof Error) {
                  console.error(`[Memory Service] Error details: ${error.message}`);
                  console.error(`[Memory Service] Stack trace:`, error.stack);
                }
              }
            } else {
              console.warn('[Memory Service] No conversation ID found for connection, skipping memory processing');
            }

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
            const agentId = data.start.customParameters?.agent_id;
            const callPhoneNumber = process.env.PHONE_NUMBER!;

            console.log('[Twilio] Stream start data:', {
              streamSid,
              conversationID: data.start.conversationID,
              callSid: data.start.callSid,
              agentId,
              fullStartData: data.start
            });

            // Initialize user context at call start
            const initializeUserContext = async () => {
              try {
                console.log('[UserContext] Initializing context at call start');

                // Try to find existing user by phone number
                const existingUserId = await basicInfo.getUserID({ phoneNumber: callPhoneNumber });

                if (existingUserId) {
                  // Existing user - populate full context
                  console.log('[UserContext] Found existing user, loading full context');
                  const userInfo = await basicInfo.getAllUserInfo(existingUserId);

                  if (userInfo) {
                    await userContextManager.setContext(streamSid!, {
                      userId: existingUserId,
                      conversationID: '', // Will be updated when ElevenLabs provides it
                      lastConversationId: userInfo.lastConversationId || undefined,
                      phoneNumber: userInfo.phoneNumber || undefined,
                      fullName: userInfo.fullName
                    });

                    // Also create context by phone number for easy lookup
                    await userContextManager.setContext(callPhoneNumber, {
                      userId: existingUserId,
                      conversationID: '',
                      lastConversationId: userInfo.lastConversationId || undefined,
                      phoneNumber: userInfo.phoneNumber || undefined,
                      fullName: userInfo.fullName
                    });

                    console.log('[UserContext] ✅ Full context created for existing user');
                  }
                } else {
                  // New user (onboarding) - create minimal context
                  console.log('[UserContext] New user detected, creating minimal context for onboarding');

                  // Create minimal context with just phone number and streamSid
                  // userId will be added when user is created during onboarding
                  const minimalContext = {
                    userId: 'PENDING', // Placeholder until user is created
                    conversationID: '',
                    phoneNumber: callPhoneNumber,
                    fullName: undefined,
                    lastConversationId: undefined
                  };

                  await userContextManager.setContext(streamSid!, minimalContext);
                  await userContextManager.setContext(callPhoneNumber, minimalContext);

                  console.log('[UserContext] ✅ Minimal context created for new user');
                }
              } catch (error) {
                console.error('[UserContext] ❌ Failed to initialize context:', error);
              }
            };

            // Initialize context asynchronously
            initializeUserContext();

            activeConnections.set(streamSid!, {
              streamSid: streamSid!,
              twilioWs: ws,
              elevenLabsWs: null,
              conversationId: '', // Will be set later from ElevenLabs messages
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
      console.log(`[Twilio] Media stream disconnected for streamSid: ${streamSid}`);
      if (streamSid && activeConnections.has(streamSid)) {
        const connection = activeConnections.get(streamSid)!;
        console.log(`[Twilio] Closing ElevenLabs WebSocket for streamSid: ${streamSid}`);;

        if (connection.keepAliveInterval) {
          clearInterval(connection.keepAliveInterval);
          console.log('[Twilio] Cleared keepalive interval on disconnect');
        }
        
        if (connection.elevenLabsWs) {
          console.log(`[Twilio] Manually closing ElevenLabs WebSocket for streamSid: ${streamSid}`);
          connection.elevenLabsWs.close();
        }
        
        console.log(`[Twilio] Removing connection from activeConnections for streamSid: ${streamSid}`);
        activeConnections.delete(streamSid);
      }
      
      if (elevenLabsWs) {
        console.log(`[Twilio] Closing module-level ElevenLabs WebSocket for streamSid: ${streamSid}`);
        elevenLabsWs.close();
      }
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
