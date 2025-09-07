import { UserProfileService } from '../services/UserProfileService';
import { HealthDataService } from '../services/HealthDataService';
import { EmergencyService } from '../services/EmergencyService';
import { PersonalizationService } from '../services/PersonalizationService';
import express from 'express';

const router = express.Router();

const userProfileService = new UserProfileService();
const healthDataService = new HealthDataService();
const emergencyService = new EmergencyService();
const personalizationService = new PersonalizationService();

// Store tools for HTTP MCP server
const tools = new Map();

function registerServiceTool(
    toolName: string,
    config: {
        title: string;
        description: string;
        inputSchema: any;
        serviceMethod: (args: any) => Promise<any>;
    }
) {
    tools.set(toolName, {
        name: toolName,
        title: config.title,
        description: config.description,
        inputSchema: config.inputSchema,
        handler: config.serviceMethod
    });
}

const toolConfigs = [
    // User Profile Service Tools
    {
        name: "create_user",
        title: "Create User Account",
        description: "Creates a new user account when someone provides their complete full name during onboarding. Use this tool immediately after a person tells you their first and last name together. This must be the first step before collecting any other information. Any other information you can keep in memory but won't be able to add to the database until the user is created in the database.",
        inputSchema: {
            type: "object",
            properties: {
                fullName: { type: "string", description: "User's full name" },
                conversationID: { type: "string", description: "UID for Conversation" }
            },
            required: ["fullName", "conversationID"]
        },
        serviceMethod: async ({ fullName, conversationID }: any) => 
            userProfileService.createUser({ fullName }, conversationID)
    },
    {
        name: "save_user_data",
        title: "Save User Data",
        description: "Updates a specific field in the user's profile with new data.",
        inputSchema: {
            type: "object",
            properties: {
                field: { type: "string", description: "Field name to update" },
                value: { description: "New value for the field" },
                conversationID: { type: "string", description: "UID for Conversation" }
            },
            required: ["field", "value", "conversationID"]
        },
        serviceMethod: async ({ field, value, conversationID }: any) => 
            userProfileService.saveUserData({ field, value }, conversationID)
    },
    {
        name: "check_missing_info",
        title: "Check Missing Information",
        description: "Checks what required information is missing from a user's profile.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID to check" }
            },
            required: ["userId"]
        },
        serviceMethod: async ({ userId }: any) => 
            userProfileService.checkMissingInfo({ userId })
    },
    {
        name: "get_user_profile",
        title: "Get User Profile",
        description: "Retrieves complete user profile information including health data and emergency contacts.",
        inputSchema: {
            type: "object",
            properties: {
                phoneNumber: { type: "string", description: "Phone number to lookup user" }
            },
            required: []
        },
        serviceMethod: async (parameters: any) => 
            userProfileService.getUserProfile(parameters)
    },
    {
        name: "complete_pol_check",
        title: "Complete Proof of Life Check",
        description: "Completes a proof of life check with status and notes.",
        inputSchema: {
            type: "object",
            properties: {
                checkStatus: { type: "string", description: "Status of the check" },
                notes: { type: "string", description: "Additional notes about the check" }
            },
            required: ["checkStatus"]
        },
        serviceMethod: async ({ checkStatus, notes }: any) => 
            userProfileService.completePolCheck({ checkStatus, notes })
    },
    
    // Health Data Service Tools
    {
        name: "add_health_condition",
        title: "Add Health Condition",
        description: "Adds a health condition to the user's medical profile.",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Name of the health condition" },
                category: { type: "string", description: "Category of health condition" },
                severity: { type: "string", description: "Severity level" },
                notes: { type: "string", description: "Additional notes" },
                conversationID: { type: "string", description: "UID for Conversation" }
            },
            required: ["name", "category", "conversationID"]
        },
        serviceMethod: async ({ name, category, severity, notes, conversationID }: any) => 
            healthDataService.addHealthCondition({ name, category, severity, notes }, conversationID)
    },
    {
        name: "get_user_health_conditions",
        title: "Get User Health Conditions",
        description: "Retrieves all health conditions for a user.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID to get health conditions for" }
            },
            required: ["userId"]
        },
        serviceMethod: async ({ userId }: any) => 
            healthDataService.getUserHealthConditions({ userId })
    },
    {
        name: "add_medication",
        title: "Add Medication",
        description: "Adds a medication to the user's medication list.",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Medication name" },
                category: { type: "string", description: "Medication category" },
                dosage: { type: "string", description: "Dosage information" },
                frequency: { type: "string", description: "How often to take the medication" },
                prescriber: { type: "string", description: "Prescribing doctor" },
                notes: { type: "string", description: "Additional notes" },
                conversationID: { type: "string", description: "UID for Conversation" }
            },
            required: ["name", "category", "dosage", "frequency", "conversationID"]
        },
        serviceMethod: async ({ name, category, dosage, frequency, prescriber, notes, conversationID }: any) => 
            healthDataService.addMedication({ name, category, dosage, frequency, prescriber, notes }, conversationID)
    },
    {
        name: "get_user_medications",
        title: "Get User Medications",
        description: "Retrieves all medications for a user.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID to get medications for" }
            },
            required: ["userId"]
        },
        serviceMethod: async ({ userId }: any) => 
            healthDataService.getUserMedications({ userId })
    },
    {
        name: "check_health_status",
        title: "Check Health Status",
        description: "Records the user's current health status during check-ins.",
        inputSchema: {
            type: "object",
            properties: {
                status: { type: "string", description: "Overall health status" },
                symptoms: { type: "string", description: "Any symptoms reported" },
                severity: { type: "string", description: "Severity of symptoms" }
            },
            required: ["status"]
        },
        serviceMethod: async ({ status, symptoms, severity }: any) => 
            healthDataService.checkHealthStatus({ status, symptoms, severity })
    },
    {
        name: "verify_medication_compliance",
        title: "Verify Medication Compliance",
        description: "Logs whether the user has taken their medications as prescribed.",
        inputSchema: {
            type: "object",
            properties: {
                medicationName: { type: "string", description: "Name of the medication" },
                taken: { type: "boolean", description: "Whether the medication was taken" },
                timeOfDay: { type: "string", description: "Time of day the medication was taken/missed" }
            },
            required: ["medicationName", "taken", "timeOfDay"]
        },
        serviceMethod: async ({ medicationName, taken, timeOfDay }: any) => 
            healthDataService.verifyMedicationCompliance({ medicationName, taken, timeOfDay })
    },
    
    // Emergency Service Tools
    {
        name: "create_emergency_contact",
        title: "Create Emergency Contact",
        description: "Adds an emergency contact to the user's profile.",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Contact's full name" },
                phoneNumber: { type: "string", description: "Contact's phone number" },
                relationship: { type: "string", description: "Relationship to user" },
                email: { type: "string", description: "Contact's email address" },
                isPrimary: { type: "boolean", description: "Whether this is the primary contact" },
                address: { type: "string", description: "Contact's address" },
                notes: { type: "string", description: "Additional notes" },
                conversationID: { type: "string", description: "UID for Conversation" }
            },
            required: ["name", "phoneNumber", "relationship", "conversationID"]
        },
        serviceMethod: async ({ name, phoneNumber, relationship, email, isPrimary, address, notes, conversationID }: any) => 
            emergencyService.createEmergencyContact({ name, phoneNumber, relationship, email, isPrimary, address, notes }, conversationID)
    },
    {
        name: "detect_emergency_situation",
        title: "Detect Emergency Situation",
        description: "Escalates to human agent when emergency situation is detected.",
        inputSchema: {
            type: "object",
            properties: {
                escalate: { type: "boolean", description: "Whether to escalate to human" },
                urgencyLevel: { type: "string", description: "Level of urgency (low, medium, high, critical)" },
                description: { type: "string", description: "Description of the emergency" },
                reason: { type: "string", description: "Reason for escalation" }
            },
            required: ["escalate"]
        },
        serviceMethod: async ({ escalate, urgencyLevel, description, reason }: any) => 
            emergencyService.escalateToHuman({ escalate, urgencyLevel, description, reason })
    },
    
    // Personalization Service Tools
    {
        name: "save_personalization_data",
        title: "Save Personalization Data",
        description: "Saves personalization data like daily routine to user profile.",
        inputSchema: {
            type: "object",
            properties: {
                field: { type: "string", description: "Personalization field to update" },
                value: { description: "Value to save" },
                conversationID: { type: "string", description: "UID for Conversation" }
            },
            required: ["field", "value", "conversationID"]
        },
        serviceMethod: async ({ field, value, conversationID }: any) => 
            personalizationService.savePersonalizationData({ field, value }, conversationID)
    },
    {
        name: "get_user_personalization",
        title: "Get User Personalization",
        description: "Retrieves personalization data for a user including hobbies, interests, likes/dislikes.",
        inputSchema: {
            type: "object",
            properties: {
                conversationID: { type: "string", description: "UID for Conversation" }
            },
            required: ["conversationID"]
        },
        serviceMethod: async ({ conversationID }: any) => 
            personalizationService.getUserPersonalization({ conversationID })
    },
    {
        name: "add_hobby_interest",
        title: "Add Hobby Interest",
        description: "Adds a hobby or interest to the user's personalization profile.",
        inputSchema: {
            type: "object",
            properties: {
                hobby: { type: "string", description: "Hobby or interest to add" },
                conversationID: { type: "string", description: "UID for Conversation" }
            },
            required: ["hobby", "conversationID"]
        },
        serviceMethod: async ({ hobby, conversationID }: any) => 
            personalizationService.addHobbyInterest({ hobby }, conversationID)
    },
    {
        name: "add_favorite_topic",
        title: "Add Favorite Topic",
        description: "Adds a favorite conversation topic to the user's profile.",
        inputSchema: {
            type: "object",
            properties: {
                topic: { type: "string", description: "Favorite topic to add" },
                conversationID: { type: "string", description: "UID for Conversation" }
            },
            required: ["topic", "conversationID"]
        },
        serviceMethod: async ({ topic, conversationID }: any) => 
            personalizationService.addFavoriteTopic({ topic }, conversationID)
    },
    {
        name: "add_like_dislike",
        title: "Add Like/Dislike",
        description: "Adds something the user likes or dislikes to their personalization profile.",
        inputSchema: {
            type: "object",
            properties: {
                item: { type: "string", description: "Item the user likes or dislikes" },
                type: { 
                    type: "string", 
                    enum: ["like", "dislike"], 
                    description: "Whether this is something they like or dislike" 
                },
                conversationID: { type: "string", description: "UID for Conversation" }
            },
            required: ["item", "type", "conversationID"]
        },
        serviceMethod: async ({ item, type, conversationID }: any) => 
            personalizationService.addLikeDislike({ item, type }, conversationID)
    }
];

// Register all tools
toolConfigs.forEach(config => {
    registerServiceTool(config.name, {
        title: config.title,
        description: config.description,
        inputSchema: config.inputSchema,
        serviceMethod: config.serviceMethod
    });
});

// MCP Protocol HTTP endpoint
router.post("/mcp", async (req, res) => {
    try {
        const { method, params } = req.body;
        
        switch (method) {
            case 'initialize':
                res.json({
                    protocolVersion: "2024-11-05",
                    capabilities: {
                        tools: {}
                    },
                    serverInfo: {
                        name: "naiber-mcp",
                        version: "1.0.0"
                    }
                });
                break;
                
            case 'tools/list':
                res.json({
                    tools: Array.from(tools.values()).map(tool => ({
                        name: tool.name,
                        description: tool.description,
                        inputSchema: tool.inputSchema
                    }))
                });
                break;
                
            case 'tools/call':
                const { name, arguments: args } = params;
                const tool = tools.get(name);
                if (!tool) {
                    return res.status(404).json({ 
                        error: { 
                            code: -32601, 
                            message: `Tool ${name} not found` 
                        } 
                    });
                }
                
                const result = await tool.handler(args);
                res.json({
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify(result) 
                    }]
                });
                break;
                
            default:
                res.status(400).json({ 
                    error: { 
                        code: -32601, 
                        message: `Unknown method: ${method}` 
                    } 
                });
        }
    } catch (error: any) {
        console.error('[MCP Server] Error:', error);
        res.status(500).json({ 
            error: { 
                code: -32603, 
                message: error.message 
            } 
        });
    }
});

export default router;