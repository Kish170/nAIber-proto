import { OpenAIResponse, Question, UserResponse } from "../types/Types";
import { callOpenAI } from "./LLMConnection";

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

  public getNextQuestion(index: number): Question | null {
    if (index >= this.questions.length) {
      return null;
    }
    
    let currentQuestion = this.questions[index]
    if (currentQuestion.isAnswered) {
      return this.getNextQuestion(index + 1);
    }
    return currentQuestion
  }

  public isComplete(index: number): boolean {
    return index >= this.questions.length;
  }

  public async storeResponse(question: Question, response: string | boolean | number): Promise<boolean> {
    const questionId = question.id;
    const result = await this.validateResponse(questionId, response.toString());
    console.log(`Validation for question '${questionId}':`, result);
    if (result.valid) {
      console.log(`Response for question '${questionId}' was validated successfully.`);
      if (question) {
        question.isAnswered = true;
      }
    } else {
      console.log(`Response for question '${questionId}' failed validation. Reason: ${result.reason}`);
    }
    this.responses.push({
      questionId,
      response,
      timestamp: new Date()
    });
    console.log(`Stored response for question '${questionId}':`, { questionId, response });
    return result.valid;
  }

  public getResponses(): UserResponse[] {
    console.log('All stored responses:', this.responses);
    return [...this.responses];
  }

  public getResponsesByCategory(category: string): UserResponse[] {
    const questionIdsInCategory = this.questions
      .filter(q => q.category === category)
      .map(q => q.id);
    return this.responses.filter(r => questionIdsInCategory.includes(r.questionId));
  }

  public clearResponses(): void {
    console.log('Clearing all stored responses.');
    this.responses = [];
  }

  private async validateResponse(questionType: string, userResponse: string): Promise<{ valid: boolean, reason: string, suggestion: string }> {
    const validationRules = {
      "full_name": "Must contain first and last name (at least 2 words)",
      "phone_number": "Must be a valid phone number format (10+ digits)",
      "age": "Must be a number between 18-120",
      "gender": "Must specify gender (male, female, non-binary, prefer not to say, etc.)",
      "health_conditions": "Must list specific conditions or say 'none' - no vague responses",
      "primary_user_confirmation": "Must be clear yes/no confirmation",
      "caregiver_info": "Must provide name and contact info or say 'none'",
      "emergency_contact": "Must provide name and phone number",
      "checkin_frequency": "Must specify frequency (daily, weekly, monthly, etc.)"
    };
    const prompt = `You are validating user input for a healthcare/elderly care system. Be STRICT - this is important safety data.
      QUESTION TYPE: ${questionType}
      VALIDATION RULE: ${validationRules[questionType as keyof typeof validationRules] || "Must provide relevant information"}
      USER RESPONSE: "${userResponse}"

      Check if the response meets the validation rule. Be strict but reasonable.

      ACCEPT:
      - Complete, relevant answers
      - "None" or "N/A" when appropriate
      - Reasonable variations in format

      REJECT:
      - Vague responses ("maybe", "I think", "possibly")
      - Incomplete information
      - Clearly wrong format (letters for phone numbers)
      - Non-answers ("I don't know" without clarification)

      Respond with ONLY this JSON:
      {
        "valid": true/false,
        "reason": "brief explanation",
        "suggestion": "how they could improve their answer"
      }`;

    try {
      const response = await callOpenAI(prompt);
      if (response.success) {
        const result = JSON.parse(response.message);
        return {
          valid: result.valid,
          reason: result.reason,
          suggestion: result.suggestion
        };
      } else {
        console.error('Failed to validate response with OpenAI:', response.error);
        return {
          valid: false,
          reason: 'Validation service unavailable',
          suggestion: 'Please try again or provide a clearer response.'
        };
      }
    } catch (error) {
      console.error('Error during response validation:', error);
      return {
        valid: false,
        reason: 'Internal error during validation',
        suggestion: 'Please try again.'
      };
    }
  }

}
