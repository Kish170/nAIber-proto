import dotenv from 'dotenv';
import path from 'path';
import { OpenAIResponse } from '../types/Types';
import { MemorySaver } from "@langchain/langgraph";

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export async function callOpenAI(
  userMessage: string,
  systemMessage: string = 'You are a helpful, patient, and friendly assistant designed to have conversations with elderly users. Speak clearly, be respectful, and take your time to explain things thoroughly.'
): Promise<OpenAIResponse> {
  const url = 'https://api.openai.com/v1/chat/completions';
  const apiKey = process.env.OPENAI_API_KEY;
  const agentCheckpointer = new MemorySaver(); // incorporate later need this for memory management across multiple calls but right now focuse on memory management within a call



  if (!apiKey) {
    console.error('OpenAI API key is not defined in environment variables.');
    return {
      success: false,
      message: 'I apologize, but there is a configuration issue. Please try again later.',
      error: 'OpenAI API key is not defined.'
    };
  }

  const requestBody = {
    model: 'gpt-4o-mini', 
    messages: [
      {
        role: 'system',
        content: systemMessage
      },
      {
        role: 'user',
        content: userMessage
      }
    ],
    max_tokens: 500,
    temperature: 0.7 
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return {
      success: true,
      message: data.choices[0].message.content,
      // usage: data.usage will track in the future
    };
  } catch (error: any) {
    console.error('Error calling OpenAI API:', error);
    return {
      success: false,
      error: error.message,
      message: 'I apologize, but I encountered an error. Please try again.'
    };
  }
}
