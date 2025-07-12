import { OpenAIResponse, Question, UserResponse } from "../types/Types";
import { callOpenAI } from "../mcp/LLMConnection";
import { BaseMessage, HumanMessage, isAIMessage } from "@langchain/core/messages";
import { GraphRecursionError } from "@langchain/langgraph";
import { app } from '../mcp/graphs/BasicgGraph'

export class QuestionManager {
  private questions: Question[] = [];
  private responses: UserResponse[] = [];

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
    const input = {
      messages: [
        new HumanMessage(
          `${userResponse}`
        )
      ],
    };
    try {
      let finalOutput
      for await (
        const output of await app.stream(input, {
          streamMode: "values",
          recursionLimit: 20,
        })
      ) {
        finalOutput =  output.messages[output.messages.length - 1];
      }
      return finalOutput
    } catch (error) {
        console.error(error);
        return null
    }
  }
}
