import { OpenAIResponse, Question, UserResponse } from "../types/Types";
import { callOpenAI } from "../mcp/LLMConnection";
import { BaseMessage, HumanMessage, SystemMessage, isAIMessage } from "@langchain/core/messages";
import { GraphRecursionError } from "@langchain/langgraph";
import { app } from '../mcp/graphs/BasicgGraph'

export class QuestionManager {
  private questions: Question[] = [];
  private responses: UserResponse[] = [];
  private currentState: any = {
    messages: [],
    userId: undefined,
    currentStep: 'greeting',
    collectedData: []
  };

  constructor(questions?: Question[]) {
    this.questions = questions || [
      { id: 'full_name', text: "What is your full name?", category: 'personal', isAnswered: false },
      { id: 'phone_number', text: "What is your phone number?", category: 'personal', isAnswered: false },
      { id: 'age', text: "How old are you?", category: 'personal', isAnswered: false },
      { id: 'gender', text: "What is your gender?", category: 'personal', isAnswered: false },
      { id: 'health_conditions', text: "Do you have any health conditions?", category: 'health', isAnswered: false },
      { id: 'primary_user_confirmation', text: "Are you the primary user of this service?", category: 'personal', isAnswered: false },
      { id: 'caregiver_info', text: "Please provide caregiver information if applicable.", category: 'personal', isAnswered: false },
      { id: 'emergency_contact', text: "Who is your emergency contact?", category: 'personal', isAnswered: false },
      { id: 'checkin_frequency', text: "How often would you like to check in?", category: 'personal', isAnswered: false }
    ];
  }

  public async validateResponse(userResponse: string): Promise<BaseMessage | null | undefined> {
    // Handle initial greeting with SystemMessage when userResponse is empty
    let newMessage: BaseMessage;
    if (userResponse === "" && this.currentState.messages.length === 0) {
      newMessage = new SystemMessage("Start the onboarding conversation by greeting the user and asking for their full name.");
    } else {
      newMessage = new HumanMessage(userResponse);
    }
    
    const input = {
      messages: [...this.currentState.messages, newMessage],
      userId: this.currentState.userId,
      currentStep: this.currentState.currentStep,
      collectedData: this.currentState.collectedData
    };

    try {
      let finalOutput;
      console.log('Streaming graph execution with state:', {
        messageCount: input.messages.length,
        userId: input.userId,
        currentStep: input.currentStep
      });
      
      for await (
        const output of await app.stream(input, {
          streamMode: "values",
          recursionLimit: 10,
        })
      ) {
        console.log('Graph output step:', {
          messageCount: output.messages?.length,
          userId: output.userId,
          lastMessageType: output.messages?.[output.messages.length - 1]?.constructor.name
        });
        
        // Update our current state with the latest output
        this.currentState = output;
        finalOutput = output.messages[output.messages.length - 1];
      }
      
      return finalOutput;
    } catch (error) {
        console.error('Error in validateResponse:', error);
        return null;
    }
  }

  public getUserId(): string | undefined {
    return this.currentState.userId;
  }
}
