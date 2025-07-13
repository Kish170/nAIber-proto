import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { BasicInfoCRUD } from '../CRUD/BasicInfo'
import { CheckInFrequency, Gender } from '../../../../generated/prisma'

const basicInfoCRUD = new BasicInfoCRUD()

const createUserTool = new DynamicStructuredTool({
    name: "createUser",
    description: "Creates a new user with basic info", 
    schema: z.object({
        fullName: z.string(),
        age: z.number(), 
        phoneNumber: z.string(),
        gender: z.enum(['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY']).optional(), 
        preferredCheckInTime: z.string().optional(),
        checkInFrequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'AS_NEEDED']).optional()
    }),
    func: async (args: any) => { 
        try {
            const result = await basicInfoCRUD.createUser(args);
            
            return JSON.stringify({
                success: true,
                userId: result.id,
                message: `Successfully created user with ID: ${result.id} `
            });
        } catch (error: any) {
            return JSON.stringify({
                success: false,
                error: error.message,
                message: "Error creating user: " + error.message
            });
        }
    }
}) as any;

const updateBasicInfoTool = new DynamicStructuredTool({
    name: "updateBasicInfo",
    description: "Updates a specific field for an existing user", 
    schema: z.object({
        userId: z.string(),
        field: z.string(),
        value: z.union([z.string(), z.number()])
    }),
    func: async (args: any) => { 
        const { userId, field, value } = args;
        try {
            console.log(`Updating user ${userId}: ${field} = ${value}`);
            
            // Convert value to appropriate type based on field
            let processedValue = value;
            if (field === 'age') {
                processedValue = parseInt(value);
            } else if (field === 'gender') {
                processedValue = value.toUpperCase();
            } else if (field === 'checkInFrequency') {
                processedValue = value.toUpperCase();
            }
            
            await basicInfoCRUD.updateUser(field, processedValue, userId);
            return `Successfully updated ${field} to ${processedValue}`;
        } catch (error: any) {
            console.error(`Error updating ${field}:`, error);
            return "Error: " + error.message;
        }
    }
}) as any;

export const agentTools = [createUserTool, updateBasicInfoTool]
