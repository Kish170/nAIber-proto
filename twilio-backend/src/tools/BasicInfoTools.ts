import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { BasicInfoCRUD } from '../CRUD/BasicInfo'

const basicInfoCRUD = new BasicInfoCRUD()

export const createUserTool = new DynamicStructuredTool({
    name: "createUser",
    description: "Creates a new user with basic info", 
    schema: z.object({
        fullName: z.string().optional(),
        age: z.number().optional(), 
        phoneNumber: z.string().optional(),
        gender: z.string().optional(), 
        preferredCheckInTime: z.string().optional(),
        checkInFrequency: z.string().optional()
    }),
    func: async (args: any) => { 
        try {
            const result = await basicInfoCRUD.createUser(args);
            return `Successfully created user with ID: ${result.id}`;
        } catch (error: any) {
            return "Error creating user: " + error.message;
        }
    }
}) as any; 

export const updateBasicInfoTool = new DynamicStructuredTool({
    name: "updateBasicInfo",
    description: "Updates a specific field for an existing user", 
    schema: z.object({
        userId: z.string(),
        field: z.string(),
        value: z.string()
    }),
    func: async (args: any) => { 
        const { userId, field, value } = args;
        try {
            await basicInfoCRUD.updateUser(field, value, userId);
            return `Successfully updated ${field}`;
        } catch (error: any) {
            return "Error: " + error.message;
        }
    }
}) as any;